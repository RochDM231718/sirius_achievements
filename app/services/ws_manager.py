from fastapi import WebSocket
import structlog

logger = structlog.get_logger()


class ConnectionManager:
    def __init__(self):
        self._connections: dict[int, list[WebSocket]] = {}

    async def connect(self, user_id: int, ws: WebSocket):
        await ws.accept()
        self._connections.setdefault(user_id, []).append(ws)
        logger.debug("ws_connect", user_id=user_id)

    def disconnect(self, user_id: int, ws: WebSocket):
        conns = self._connections.get(user_id, [])
        if ws in conns:
            conns.remove(ws)
        if not conns:
            self._connections.pop(user_id, None)

    async def send_to_user(self, user_id: int, data: dict):
        for ws in list(self._connections.get(user_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(user_id, ws)

    async def broadcast_to_staff(self, data: dict, staff_ids: list[int]):
        for uid in staff_ids:
            await self.send_to_user(uid, data)


ws_manager = ConnectionManager()
