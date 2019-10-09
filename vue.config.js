module.exports = {
  lintOnSave: false,
  configureWebpack: {
    externals: {
      '@nimiq/core-web': 'Nimiq',
    },
  },
}
