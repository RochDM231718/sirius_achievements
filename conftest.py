import asyncio
import inspect


try:
    import pytest_asyncio  # noqa: F401
except ImportError:
    def pytest_pyfunc_call(pyfuncitem):
        test_function = pyfuncitem.obj
        if not inspect.iscoroutinefunction(test_function):
            return None

        kwargs = {
            arg: pyfuncitem.funcargs[arg]
            for arg in pyfuncitem._fixtureinfo.argnames
            if arg in pyfuncitem.funcargs
        }
        asyncio.run(test_function(**kwargs))
        return True
