import json
import time
import urllib.error
import urllib.request

from src.ingest.constants import SOURCE_URL


def get_json(url, timeout=30, retries=3, sleep=time.sleep, opener=None):
    opener = opener or urllib.request.urlopen
    last_error = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "brickcal/0.1",
                    "Accept": "application/json",
                },
            )
            with opener(request, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8")
            return json.loads(raw)
        except urllib.error.HTTPError as exc:
            last_error = RuntimeError("HTTP %s for %s" % (exc.code, url))
        except urllib.error.URLError as exc:
            last_error = RuntimeError("network error for %s: %s" % (url, exc.reason))
        except ValueError:
            last_error = RuntimeError("invalid JSON from %s" % url)
        except Exception as exc:
            last_error = exc
        if attempt + 1 >= retries:
            break
        sleep(1.0 * (2 ** attempt))
    raise last_error


class CaldaysClient:
    def __init__(self, timeout=30, retries=3, sleep=time.sleep, opener=None):
        self.timeout = timeout
        self.retries = retries
        self.sleep = sleep
        self.opener = opener or urllib.request.urlopen

    def list_countries(self):
        return self._get("/holidays")

    def holidays_for(self, code):
        return self._get("/holidays/%s" % str(code).strip().lower())

    def _get(self, path):
        return get_json(
            SOURCE_URL + path,
            timeout=self.timeout,
            retries=self.retries,
            sleep=self.sleep,
            opener=self.opener,
        )
