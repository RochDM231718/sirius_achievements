import sys
import types
import pytest
from unittest.mock import MagicMock, AsyncMock

if "app.repositories.admin.page_repository" not in sys.modules:
    page_repo_module = types.ModuleType("app.repositories.admin.page_repository")
    page_repo_module.PageRepository = object
    sys.modules["app.repositories.admin.page_repository"] = page_repo_module

if "app.services.admin.base_crud_service" not in sys.modules:
    base_service_module = types.ModuleType("app.services.admin.base_crud_service")

    class BaseCrudService:
        def __class_getitem__(cls, item):
            return cls

        def __init__(self, repository):
            self.repository = repository

        async def find(self, item_id):
            return await self.repository.find(item_id)

        async def get(self, filters=None):
            return await self.repository.get(filters)

        async def update(self, item_id, obj_in):
            return await self.repository.update(item_id, obj_in)

        async def delete(self, item_id):
            return await self.repository.delete(item_id)

    base_service_module.BaseCrudService = BaseCrudService
    base_service_module.CreateSchemaType = object
    base_service_module.ModelType = object
    sys.modules["app.services.admin.base_crud_service"] = base_service_module

if "app.models.page" not in sys.modules:
    page_model_module = types.ModuleType("app.models.page")

    class Page:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    page_model_module.Page = Page
    sys.modules["app.models.page"] = page_model_module

if "app.schemas.admin.pages" not in sys.modules:
    page_schema_module = types.ModuleType("app.schemas.admin.pages")

    class PageCreate:
        def __init__(self, title, content, slug=None):
            self.title = title
            self.content = content
            self.slug = slug

    class PageUpdate(PageCreate):
        pass

    page_schema_module.PageCreate = PageCreate
    page_schema_module.PageUpdate = PageUpdate
    sys.modules["app.schemas.admin.pages"] = page_schema_module

if "slugify" not in sys.modules:
    slugify_module = types.ModuleType("slugify")
    slugify_module.slugify = lambda value: value.strip().lower().replace(" ", "-")
    sys.modules["slugify"] = slugify_module

from app.services.admin.page_service import PageService
from app.schemas.admin.pages import PageCreate, PageUpdate
from app.models.page import Page


@pytest.fixture
def mock_repo():
    repo = MagicMock()
    repo.find = AsyncMock()
    repo.get = AsyncMock()
    repo.create = AsyncMock()
    repo.update = AsyncMock()
    repo.delete = AsyncMock()
    repo.is_slug_exists = AsyncMock(return_value=False)
    return repo


@pytest.fixture
def service(mock_repo):
    return PageService(repo=mock_repo)


def _get_page(id=1, title="Title", content="Content", slug="title"):
    return Page(id=id, title=title, content=content, slug=slug)


@pytest.mark.asyncio
async def test_create_page_generates_slug_and_saves(service, mock_repo):
    page_data = PageCreate(title="Title", content="Content")
    page = _get_page()
    mock_repo.create.return_value = page

    result = await service.create(page_data)

    assert page_data.slug == "title"
    mock_repo.is_slug_exists.assert_called_once_with("title")
    mock_repo.create.assert_called_once_with(page_data)
    assert result == page


@pytest.mark.asyncio
async def test_update_page_regenerates_slug(service, mock_repo):
    page_data = PageUpdate(title="Title Updated", content="Content Updated")
    page = _get_page(title="Title Updated", content="Content Updated", slug="title-updated")
    mock_repo.update.return_value = page

    result = await service.update(1, page_data)

    assert page_data.slug == "title-updated"
    mock_repo.is_slug_exists.assert_called_once_with("title-updated")
    mock_repo.update.assert_called_once_with(1, page_data)
    assert result == page


@pytest.mark.asyncio
async def test_get_slug_handles_duplicates(service, mock_repo):
    mock_repo.is_slug_exists.side_effect = [True, True, False]
    slug = await service._get_slug("My Page")
    assert slug == "my-page-2"


@pytest.mark.asyncio
async def test_find_page(service, mock_repo):
    page = _get_page()
    mock_repo.find.return_value = page

    result = await service.find(1)

    mock_repo.find.assert_called_once_with(1)
    assert result == page


@pytest.mark.asyncio
async def test_get_pages(service, mock_repo):
    pages = [_get_page()]
    mock_repo.get.return_value = pages

    result = await service.get()

    mock_repo.get.assert_called_once_with(None)
    assert result == pages


@pytest.mark.asyncio
async def test_delete_page(service, mock_repo):
    await service.delete(1)
    mock_repo.delete.assert_called_once_with(1)
