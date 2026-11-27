import ipaddress

from app.core.config import settings

_reader = None


def lookup(ip: str) -> str:
    """Human-readable location for an IP. Uses a MaxMind GeoLite2 database when configured."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return "Unknown"
    if addr.is_private or addr.is_loopback:
        return "Local network"
    global _reader
    if settings.geoip_db_path:
        try:
            if _reader is None:
                import geoip2.database  # optional dependency: pip install geoip2

                _reader = geoip2.database.Reader(settings.geoip_db_path)
            r = _reader.city(ip)
            parts = [p for p in (r.city.name, r.country.iso_code) if p]
            return ", ".join(parts) or "Unknown"
        except Exception:
            return "Unknown"
    return "Unknown"
