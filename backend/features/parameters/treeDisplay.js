// Owner: Role 2, Wei Jie.
// Which tree the wall shows: the 2D tree (/tree) or the 3D tree (/3dTree), chosen in the admin's
// Display 2D/3D Tree (treeParameters.treeDisplayMode). Opening the other tree's address goes straight to
// the chosen one (keeping any ?options), with no message in between; a tree page already open switches by
// itself when the admin changes the choice (frontend/tree/tree.js and frontend/3dTree/tree3d-settings.js).
// Used by server.js and kioskServer.js.
const parametersConfigStore = require('./store');

const TREE_ROUTES = Object.freeze({ '2d': '/tree', '3d': '/3dTree' });

function activeTreeDisplayMode() {
    const mode = String(parametersConfigStore.readParametersConfig().treeParameters?.treeDisplayMode || '2d').trim().toLowerCase();
    return mode === '3d' ? '3d' : '2d';
}

// A route handler for one tree's page: sends the page when that tree is chosen, otherwise redirects to
// the chosen tree's address. (chosenMode is the saved choice; a test can pass its own.)
function serveChosenTree(mode, sendPage, chosenMode = activeTreeDisplayMode) {
    return (req, res) => {
        const active = chosenMode() === '3d' ? '3d' : '2d';
        if (active === mode) return sendPage(req, res);
        const url = String(req.originalUrl || '');
        const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
        return res.redirect(302, `${TREE_ROUTES[active]}${query}`);
    };
}

module.exports = { TREE_ROUTES, activeTreeDisplayMode, serveChosenTree };
