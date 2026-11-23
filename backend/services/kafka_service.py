"""
kafka_service.py — Asynchronous Apache Kafka Integration for EDCIF.

Supports Aiven Cloud Kafka (SASL_SSL) and local Kafka brokers.
Publishes clinical biomarker ingest events to 'ckd.lab.events' and
critical patient alerts to 'ckd.critical.alerts'.
A background consumer subscribes to 'ckd.critical.alerts' and forwards
real-time alerts to the WebSocket alert manager.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import ssl
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from dotenv import dotenv_values

logger = logging.getLogger("ckd.kafka")
logging.basicConfig(level=logging.INFO)

try:
    from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
    KAFKA_AVAILABLE = True
except ImportError:
    KAFKA_AVAILABLE = False
    logger.warning("[KAFKA] aiokafka not installed; Kafka integration running in simulation fallback mode.")


class KafkaService:
    def __init__(self) -> None:
        self.producer: Optional[Any] = None
        self.consumer: Optional[Any] = None
        self._consumer_task: Optional[asyncio.Task] = None
        self._is_connected = False
        self._messages_produced = 0
        self._messages_consumed = 0

        # Load configuration from backend/.env
        env_file = Path(__file__).resolve().parent.parent / ".env"
        env = dotenv_values(str(env_file)) if env_file.exists() else {}

        self.bootstrap_servers = (
            env.get("KAFKA_BOOTSTRAP_SERVERS")
            or os.getenv("KAFKA_BOOTSTRAP_SERVERS")
        )
        self.security_protocol = (
            env.get("KAFKA_SECURITY_PROTOCOL")
            or os.getenv("KAFKA_SECURITY_PROTOCOL", "SASL_SSL")
        )
        self.sasl_mechanism = (
            env.get("KAFKA_SASL_MECHANISM")
            or os.getenv("KAFKA_SASL_MECHANISM", "SCRAM-SHA-256")
        )
        self.sasl_username = (
            env.get("KAFKA_SASL_USERNAME")
            or os.getenv("KAFKA_SASL_USERNAME")
        )
        self.sasl_password = (
            env.get("KAFKA_SASL_PASSWORD")
            or os.getenv("KAFKA_SASL_PASSWORD")
        )
        self.topic_lab_events = (
            env.get("KAFKA_TOPIC_LAB_EVENTS")
            or os.getenv("KAFKA_TOPIC_LAB_EVENTS", "ckd.lab.events")
        )
        self.topic_alerts = (
            env.get("KAFKA_TOPIC_ALERTS")
            or os.getenv("KAFKA_TOPIC_ALERTS", "ckd.critical.alerts")
        )

    def _get_ssl_context(self) -> ssl.SSLContext:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx

    async def start(self) -> None:
        """Start Kafka producer and background consumer if configured."""
        if not KAFKA_AVAILABLE or not self.bootstrap_servers:
            logger.info("[KAFKA] No Kafka broker configured or aiokafka missing; using fallback.")
            return

        try:
            ssl_ctx = self._get_ssl_context() if "SSL" in self.security_protocol else None

            # 1. Initialize Producer
            self.producer = AIOKafkaProducer(
                bootstrap_servers=self.bootstrap_servers,
                security_protocol=self.security_protocol,
                sasl_mechanism=self.sasl_mechanism,
                sasl_plain_username=self.sasl_username,
                sasl_plain_password=self.sasl_password,
                ssl_context=ssl_ctx,
            )
            await self.producer.start()
            self._is_connected = True
            logger.info(f"[KAFKA] Connected to broker: {self.bootstrap_servers}")

            # 2. Launch background consumer for critical alerts
            self._consumer_task = asyncio.create_task(self._consume_critical_alerts())

        except Exception as exc:
            logger.warning(f"[KAFKA] Startup connection failed ({exc}); continuing with WebSocket fallback.")
            self._is_connected = False

    async def stop(self) -> None:
        """Gracefully stop producer and consumer."""
        if self._consumer_task:
            self._consumer_task.cancel()
            try:
                await self._consumer_task
            except asyncio.CancelledError:
                pass

        if self.consumer:
            try:
                await self.consumer.stop()
            except Exception:
                pass

        if self.producer:
            try:
                await self.producer.stop()
            except Exception:
                pass

        self._is_connected = False
        logger.info("[KAFKA] Service shutdown completed.")

    async def publish_event(self, topic: str, payload: dict[str, Any]) -> bool:
        """Publish an event dictionary as JSON to the specified Kafka topic."""
        if not self._is_connected or not self.producer:
            logger.debug(f"[KAFKA-MOCK] Event recorded for topic '{topic}': {payload.get('type')}")
            return False

        try:
            raw_bytes = json.dumps(payload, default=str).encode("utf-8")
            fut = await self.producer.send(topic, raw_bytes)
            record_meta = await fut
            self._messages_produced += 1
            logger.info(
                f"[KAFKA] Event published to topic '{topic}' [partition {record_meta.partition}, offset {record_meta.offset}]"
            )
            return True
        except Exception as exc:
            logger.error(f"[KAFKA] Failed to publish event to '{topic}': {exc}")
            return False

    async def publish_lab_event(self, patient_id: str, biomarker_data: dict[str, Any]) -> bool:
        """Publish clinical lab test biomarker telemetry."""
        payload = {
            "type": "CLINICAL_LAB_INGEST",
            "patient_id": patient_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "biomarkers": biomarker_data,
        }
        return await self.publish_event(self.topic_lab_events, payload)

    async def publish_critical_alert(self, alert_payload: dict[str, Any]) -> bool:
        """Publish critical renal risk alert."""
        payload = {
            "type": "CRITICAL_RENAL_ALERT",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **alert_payload,
        }
        return await self.publish_event(self.topic_alerts, payload)

    async def _consume_critical_alerts(self) -> None:
        """Background worker consuming from Kafka alerts topic and dispatching to WebSockets."""
        try:
            ssl_ctx = self._get_ssl_context() if "SSL" in self.security_protocol else None
            self.consumer = AIOKafkaConsumer(
                self.topic_alerts,
                bootstrap_servers=self.bootstrap_servers,
                security_protocol=self.security_protocol,
                sasl_mechanism=self.sasl_mechanism,
                sasl_plain_username=self.sasl_username,
                sasl_plain_password=self.sasl_password,
                ssl_context=ssl_ctx,
                group_id="edcif-clinical-alert-group",
                auto_offset_reset="latest",
            )
            await self.consumer.start()
            logger.info(f"[KAFKA-CONSUMER] Subscribed to topic: {self.topic_alerts}")

            from services.alert_manager import alert_manager

            async for msg in self.consumer:
                self._messages_consumed += 1
                try:
                    data = json.loads(msg.value.decode("utf-8"))
                    logger.info(f"[KAFKA-CONSUMER] Received alert: {data.get('type')}")
                    # Broadcast to doctor browser dashboards
                    await alert_manager.broadcast(data)
                except Exception as parse_err:
                    logger.error(f"[KAFKA-CONSUMER] Error processing message: {parse_err}")

        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.warning(f"[KAFKA-CONSUMER] Consumer loop ended ({exc}); continuing.")

    def get_status(self) -> dict[str, Any]:
        """Return live health and statistics of the Kafka service."""
        return {
            "is_connected": self._is_connected,
            "broker": self.bootstrap_servers or "Not Configured",
            "topics": [self.topic_lab_events, self.topic_alerts],
            "messages_produced": self._messages_produced,
            "messages_consumed": self._messages_consumed,
            "status": "HEALTHY" if self._is_connected else "STANDBY / FALLBACK",
        }


# Singleton instance for application-wide use
kafka_service = KafkaService()

