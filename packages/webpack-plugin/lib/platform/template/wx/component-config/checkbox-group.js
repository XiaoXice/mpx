const TAG_NAME = 'checkbox-group'

module.exports = function () {
  return {
    test: TAG_NAME,
    event: [
      {
        test: /^(change)$/,
        ali (eventName) {
          const eventMap = {
            'change': 'Change'
          }
          return eventMap[eventName]
        }
      }
    ]
  }
}
