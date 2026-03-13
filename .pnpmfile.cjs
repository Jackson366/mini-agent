// Allow build scripts for specific packages
function readPackage(pkg, context) {
  // Allow better-sqlite3 build scripts
  if (pkg.name === 'better-sqlite3') {
    pkg.scripts = pkg.scripts || {};
    // Mark as safe to run
    context.log(`Allowing build scripts for ${pkg.name}`);
  }
  return pkg;
}

module.exports = {
  hooks: {
    readPackage
  }
};
