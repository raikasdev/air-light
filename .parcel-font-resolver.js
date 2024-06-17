const { Resolver } = require('@parcel/plugin');

module.exports = new Resolver({
  async resolve({ specifier }) {
    const shouldExcludeFile = /fonts\/.+/.test(specifier);

    if (shouldExcludeFile) {
      return { isExcluded: true };
    }

    return null;
  },
});
