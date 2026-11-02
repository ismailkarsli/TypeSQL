// Authoring installs resolve external packages only. The runner supplies checkout
// tarballs after deriving each isolated consumer's external lockfile importer.
module.exports = {
	hooks: {
		readPackage(pkg) {
			for (const field of [
				"dependencies",
				"devDependencies",
				"optionalDependencies",
			]) {
				for (const name of Object.keys(pkg[field] ?? {})) {
					if (name.startsWith("@typesql/")) delete pkg[field][name];
				}
			}
			return pkg;
		},
	},
};
