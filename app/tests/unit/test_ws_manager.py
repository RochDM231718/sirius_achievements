import asyncio
import sys
import types
from unittest.mock import AsyncMock


sys.modules.setdefault("structlog", types.SimpleNamespace(get_logger=lambda: types.SimpleNamespace()))

fastapi_module = sys.modules.get("fastapi") or types.ModuleType("fastapi")


class WebSocket:
    pass


fastapi_module.WebSocket = WebSocket
sys.modules["fastapi"] = fastapi_module

from app.services.ws_manager import ConnectionManager


def test_send_to_user_does_not_skip_live_socket_after_dead_one():
    manager = ConnectionManager()
    broken = types.SimpleNamespace(send_json=AsyncMock(side_effect=RuntimeError("socket closed")))
    alive = types.SimpleNamespace(send_json=AsyncMock())
    manager._connections[7] = [broken, alive]

    asyncio.run(manager.send_to_user(7, {"type": "ping"}))

    alive.send_json.assert_awaited_once_with({"type": "ping"})
    assert manager._connections[7] == [alive]
