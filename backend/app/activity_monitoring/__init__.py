"""Milestone 3 — Activity Monitoring.

Normalised, query-friendly activity stream (login/logout, uploads, downloads, sharing, file access,
share-link lifecycle and unauthorized attempts). Rows are written by the existing routers through
:func:`record` and mirrored to MongoDB when ``TS_MONGO_URL`` is configured.
"""
