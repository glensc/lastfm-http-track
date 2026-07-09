const LOG_LEVELS = {
  debug: 10,
  info: 20,
  error: 30
};

function createLogger({ level = "info", sink = writeToConsole } = {}) {
  const normalizedLevel = LOG_LEVELS[level] ? level : "info";

  function log(entryLevel, message, fields = {}) {
    if (LOG_LEVELS[entryLevel] < LOG_LEVELS[normalizedLevel]) {
      return;
    }

    sink({
      level: entryLevel,
      message,
      fields
    });
  }

  return {
    debug(message, fields) {
      log("debug", message, fields);
    },
    info(message, fields) {
      log("info", message, fields);
    },
    error(message, fields) {
      log("error", message, fields);
    },
    isDebugEnabled() {
      return normalizedLevel === "debug";
    }
  };
}

function createLoggedFetch({ fetchImpl = fetch, logger, now = () => Date.now() }) {
  return async function loggedFetch(url, options = {}, meta = {}) {
    const targetUrl = String(url);
    const startedAt = now();
    const fields = {
      purpose: meta.purpose || "external",
      target: summarizeUrl(targetUrl)
    };

    if (logger.isDebugEnabled()) {
      logger.debug("outbound request started", {
        ...fields,
        url: redactUrl(targetUrl)
      });
    }

    try {
      const response = await fetchImpl(url, options);
      const completedFields = {
        ...fields,
        duration_ms: now() - startedAt,
        status: response.status
      };

      if (response.ok) {
        logger.info("outbound request completed", completedFields);
      } else {
        logger.error("outbound request failed", {
          ...completedFields,
          error: `HTTP ${response.status}`
        });
      }

      if (logger.isDebugEnabled()) {
        logger.debug("outbound request detail", {
          ...completedFields,
          url: redactUrl(targetUrl)
        });
      }

      return response;
    } catch (error) {
      logger.error("outbound request failed", {
        ...fields,
        duration_ms: now() - startedAt,
        error: error.message
      });
      throw error;
    }
  };
}

function redactUrl(value) {
  const url = new URL(value);

  if (url.searchParams.has("api_key")) {
    url.searchParams.set("api_key", "[redacted]");
  }

  return url.toString();
}

function summarizeUrl(value) {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

function writeToConsole(entry) {
  const line = [entry.level, entry.message, formatFields(entry.fields)].filter(Boolean).join(" ");

  if (entry.level === "error") {
    console.error(line);
    return;
  }

  if (entry.level === "debug") {
    console.debug(line);
    return;
  }

  console.log(line);
}

function formatFields(fields) {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${formatFieldValue(value)}`)
    .join(" ");
}

function formatFieldValue(value) {
  if (typeof value === "string") {
    return /^[A-Za-z0-9_./:=?&%+#,@-]+$/.test(value) ? value : JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

module.exports = {
  createLogger,
  createLoggedFetch,
  redactUrl
};
