"""
alert_manager.py — WebSocket connection manager for real-time CKD alerts.

A singleton AlertManager tracks every connected browser client and can
broadcast structured alert payloads to all of them simultaneously.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketState


class AlertManager:
    """
    Manages all active WebSocket connections and broadcasts alert messages.

    Usage (in route handlers):
        from services.alert_manager import alert_manager

        # In WebSocket endpoint:
        await alert_manager.connect(websocket)

        # In prediction route (after a HIGH-risk result):
        await alert_manager.broadcast_alert(risk_score, prediction, top_features)
    """

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []
        self._lock = asyncio.Lock()

    # ── Connection lifecycle ─────────────────────────────────────────────────

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.append(websocket)
        print(f"[WS] Client connected. Total connections: {len(self._connections)}")

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            try:
                self._connections.remove(websocket)
            except ValueError:
                pass
        print(f"[WS] Client disconnected. Remaining: {len(self._connections)}")

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    # ── Broadcast ────────────────────────────────────────────────────────────

    async def broadcast(self, payload: dict[str, Any]) -> None:
        """Send a JSON payload to every connected client, pruning dead sockets."""
        message = json.dumps(payload)
        dead: list[WebSocket] = []

        async with self._lock:
            connections_snapshot = list(self._connections)

        for ws in connections_snapshot:
            try:
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.send_text(message)
            except Exception as exc:
                print(f"[WS] Send failed ({exc}); marking connection as dead.")
                dead.append(ws)

        # Prune dead connections
        if dead:
            async with self._lock:
                for ws in dead:
                    try:
                        self._connections.remove(ws)
                    except ValueError:
                        pass

    async def broadcast_alert(
        self,
        risk_score: float,
        prediction: str,
        risk_level: str,
        top_features: list[dict],
        patient_age: float | None = None,
        patient_id: str | None = None,
        doctor_id: int | None = None,
    ) -> None:
        """
        Construct and broadcast a structured HIGH-risk CKD alert targeted to clinicians.

        Args:
            risk_score:    0–100 percentage score.
            prediction:    "CKD" or "Non-CKD".
            risk_level:    "HIGH" or "LOW".
            top_features:  List of top SHAP feature dicts [{feature, contribution}].
            patient_age:   Optional patient age for context.
            patient_id:    Optional patient ID for tracking.
            doctor_id:     Optional assigned doctor ID.
        """
        top3 = [
            {
                "feature": f["feature"],
                "contribution": round(f["contribution"], 4),
                "direction": "risk" if f["contribution"] > 0 else "protective",
            }
            for f in (top_features or [])[:3]
        ]

        payload = {
            "type": "HIGH_RISK_ALERT",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "prediction": prediction,
            "risk_level": risk_level,
            "risk_score": round(risk_score, 2),
            "top_features": top3,
            "patient_age": patient_age,
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "message": (
                f"⚠ Clinical Alert: Patient {patient_id or '#'} showing {prediction} ({risk_score:.1f}% risk). "
                "Immediate physician evaluation advised."
            ),
        }

        await self.broadcast(payload)
        print(f"[WS] Alert broadcast to {self.connection_count} client(s) — score={risk_score:.1f}%")

        # Asynchronously dispatch critical alert to Apache Kafka broker
        try:
            from services.kafka_service import kafka_service
            asyncio.create_task(kafka_service.publish_critical_alert(payload))
        except Exception as kafka_err:
            print(f"[KAFKA] Non-fatal alert dispatch warning: {kafka_err}")

    async def broadcast_ping(self) -> None:
        """Lightweight keep-alive ping sent to all clients."""
        await self.broadcast({"type": "ping", "timestamp": datetime.now(timezone.utc).isoformat()})


# ── Module-level singleton ───────────────────────────────────────────────────
alert_manager = AlertManager()
