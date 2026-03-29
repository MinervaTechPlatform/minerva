"""
core/pipelines/components/goal_steering_component.py — Conversion steering.

Purpose:
    Evaluates the conversation progress towards a specific business goal.
    Injects "nudges" or "strong pushes" into the LLM system prompt
    to guide the user toward the objective (e.g. booking, feedback).
"""

from shared.db.connection import get_connection
from shared.utils.logging import get_logger
from ..pipeline_context import PipelineContext

logger = get_logger("core.pipelines.components.goal_steering")


class GoalSteeringComponent:
    """Nudges the LLM toward the business goal based on conversation depth."""

    @property
    def name(self) -> str:
        return "goal_steering"

    @property
    def is_critical(self) -> bool:
        return False

    async def should_execute(self, context: PipelineContext) -> bool:
        """Goal steering runs to evaluate conversational progress."""
        return True

    async def execute(self, context: PipelineContext) -> None:
        goal_text = context.client_config.get("goal_description", "Assist the customer with their questions.")
        
        # 1. Get turn count from DB
        async with get_connection(context.schema_name) as conn:
            row = await conn.fetchrow(
                "SELECT COUNT(*) as count FROM messages WHERE session_id = $1",
                context.session_id
            )
            msg_count = row["count"]
            # turn_count = user turns (approx half of messages)
            turn_count = (msg_count // 2) + 1

        # 2. Steering Logic (from POC heuristics)
        if turn_count >= 5:
            context.goal_steer_instruction = f"STRONG PUSH: {goal_text}. Lead the user to complete this now."
        elif turn_count >= 2:
            context.goal_steer_instruction = f"Nudge towards: {goal_text}"
        else:
            context.goal_steer_instruction = "None"
            
        logger.debug(f"GoalSteering: Turn={turn_count}, Instruction='{context.goal_steer_instruction}'")
