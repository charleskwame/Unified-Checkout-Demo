const safeParseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

module.exports = safeParseJson
