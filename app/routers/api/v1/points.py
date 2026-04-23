from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import settings
from app.middlewares.api_auth_middleware import auth
from app.models.enums import AchievementCategory, AchievementLevel, AchievementResult
from app.services.points_calculator import calculate_points
from app.utils.points import calculate_gpa_bonus

router = APIRouter(prefix='/api/v1/points', tags=['api.v1.points'])


@router.get('/rules')
async def point_rules(current_user=Depends(auth)):
    level_points = [
        {'level': AchievementLevel.SCHOOL.value, 'base_points': settings.POINTS_SCHOOL},
        {'level': AchievementLevel.MUNICIPAL.value, 'base_points': settings.POINTS_MUNICIPAL},
        {'level': AchievementLevel.REGIONAL.value, 'base_points': settings.POINTS_REGIONAL},
        {'level': AchievementLevel.FEDERAL.value, 'base_points': settings.POINTS_FEDERAL},
        {'level': AchievementLevel.INTERNATIONAL.value, 'base_points': settings.POINTS_INTERNATIONAL},
    ]
    result_multipliers = [
        {'result': AchievementResult.PARTICIPANT.value, 'percent': settings.RESULT_MULTIPLIER_PARTICIPANT},
        {'result': AchievementResult.PRIZEWINNER.value, 'percent': settings.RESULT_MULTIPLIER_PRIZEWINNER},
        {'result': AchievementResult.WINNER.value, 'percent': settings.RESULT_MULTIPLIER_WINNER},
    ]
    matrix = [
        {
            'level': item['level'],
            'base_points': item['base_points'],
            'scores': {
                result_item['result']: calculate_points(item['level'], AchievementCategory.OTHER.value, result_item['result'])
                for result_item in result_multipliers
            },
        }
        for item in level_points
    ]

    return {
        'formula': 'Баллы = база за уровень × коэффициент результата',
        'level_points': level_points,
        'result_multipliers': result_multipliers,
        'matrix': matrix,
        'categories': [item.value for item in AchievementCategory],
        'category_note': 'Категория показывает направление достижения и распределяет баланс по профилю, но не меняет количество баллов.',
        'status_note': 'Баллы начисляются только после одобрения документа. На проверке, доработка и отказ дают 0 баллов.',
        'balance_note': 'Общий баланс складывается из одобренных документов и бонуса за средний балл сессии. При фильтре рейтинга по отдельной категории бонус за сессию не добавляется.',
        'gpa_rules': [
            {'range': 'ниже 3.0', 'points': 0, 'note': 'бонус не начисляется'},
            {'range': '3.0-3.99', 'points': '0-14', 'note': 'пропорционально разнице выше 3.0, до 15 баллов за 1.0'},
            {'range': '4.0-4.49', 'points': '15-24', 'note': '15 баллов плюс прирост выше 4.0, до 20 баллов за 1.0'},
            {'range': '4.5 и выше', 'points': 'от 25', 'note': '25 баллов плюс прирост выше 4.5, до 10 баллов за 1.0'},
        ],
        'my_gpa_bonus': calculate_gpa_bonus(getattr(current_user, 'session_gpa', None)),
    }
