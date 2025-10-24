const nonPrintableAsciiRegex = /[^\x09\x0a\x0d\x20-\x7e]/

export function isPrintableAscii(fieldName) {
  return (req, res, next) => {
    if (!req.body) {
      res.status(400).json({error: 'request missing body'})
      return
    }
    if (!req.body[fieldName]) {
      res.status(400).json({error: `request body missing '${fieldName}' field`})
      return
    }
    const matches = req.body[fieldName].match(nonPrintableAsciiRegex)
    if (matches) {
      res.status(400).json({
        error: `character '${matches[0]}' at index ${matches.index} is not allowed`
      })
      return
    }
    next()
  }
}
