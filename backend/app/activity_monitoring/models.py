"""Activity models live in the central ``app.models`` module so every table is created by one
``Base.metadata.create_all`` call. This module re-exports them for the Milestone 3 package layout."""
from ..models import ActivityRecord

__all__ = ["ActivityRecord"]
