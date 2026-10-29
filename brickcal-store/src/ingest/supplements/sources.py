SOURCE_HOLIDAY_CN = "holiday-cn"

_CATALOG = (
    {
        "id": SOURCE_HOLIDAY_CN,
        "label": "holiday-cn（中国国务院调休）",
        "countries": ["CN"],
    },
)


def source_catalog():
    return [dict(item, countries=list(item["countries"])) for item in _CATALOG]


def source_ids():
    return [item["id"] for item in _CATALOG]


def supported_countries(source):
    for item in _CATALOG:
        if item["id"] == source:
            return list(item["countries"])
    return []


def validate_entry(code, source):
    code = str(code or "").strip().upper()
    source = str(source or "").strip()
    if len(code) != 2 or not code.isalpha():
        raise ValueError("国家代码必须是两位字母")
    if source not in source_ids():
        raise ValueError("未知数据源：%s" % source)
    allowed = supported_countries(source)
    if allowed and code not in allowed:
        raise ValueError("%s 仅支持 %s" % (source, "、".join(allowed)))
    return code, source
