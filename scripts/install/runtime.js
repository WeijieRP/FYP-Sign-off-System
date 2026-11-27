// Owner: Role 3, Jun Kai.
// The Node.js and MySQL versions the offline package carries (scripts/install/build-package.js). Node.js is checked
// against the SHASUMS256.txt of nodejs.org. MySQL is checked against the sha256 pinned here: when the version
// changes, compare the md5 the build prints with the one on Oracle's download page, then pin the new sha256.
// Node.js stays on the major version in .nvmrc (a unit test checks that).
// <Jun Kai start>
module.exports = {
    node: { version: '22.23.5' },
    // sha256 of mysql-8.4.11-winx64.zip from cdn.mysql.com (first CI build, 26 Nov 2026; md5 2e833921898a9a030ea6bfe81bd811bc)
    mysql: { version: '8.4.11', sha256: 'a492371d687d2bab088b0062581144a0044b8964baefdf4faa579292b423d25c' },
};
// <Jun Kai end>
