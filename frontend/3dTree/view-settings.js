// The 3D screen's view, as the admin sets it (Admin > Digital Tree Adjustment > 3D Tree Settings > 3D View &
// Zoom; tree3dParameters savedViews and screenView, checked by backend/features/parameters/tree3d.js):
//   - savedViews: the admin's snapshots, each a zoom (tree-view.js ZOOM_MIN to ZOOM_MAX), an angle round the
//     tree (azimuth) and a height (polar), with a name;
//   - screenView: the snapshot every 3D screen shows ('' for the standard view: zoom 1, from the front). A
//     screen opens at it, and moves smoothly to a newly chosen one within a few seconds; the automatic turn
//     carries on from there, keeping its zoom and height.
// The admin's view editor (this page opened with ?viewEditor=1, in the admin's 3D View & Zoom card) opens at
// the view in use, then is the admin's to turn and zoom (the wheel, a pinch, the + and - keys); the admin page
// reads and sets it through window.esgTree3dView (get, set, zoomBy, standard) to save snapshots and load them.
import { onTree3dSettings } from './tree3d-settings.js';

// The snapshot in use, if it is whole; otherwise none (the standard view).
function chosenView(settings) {
  const views = Array.isArray(settings?.savedViews) ? settings.savedViews : [];
  const view = views.find(item => item && item.id === settings?.screenView);
  if (!view || ![view.zoom, view.azimuth, view.polar].every(value => Number.isFinite(Number(value)))) return null;
  return { id: view.id, zoom: Number(view.zoom), azimuth: Number(view.azimuth), polar: Number(view.polar) };
}

export function installViewSettings(treeView, { editor = false } = {}) {
  let usedKey = null;
  onTree3dSettings(settings => {
    const chosen = chosenView(settings);
    const view = chosen || { zoom: 1, ...treeView.standardAngle() };
    const key = chosen ? [chosen.id, chosen.zoom, chosen.azimuth, chosen.polar].join('|') : 'standard';
    if (usedKey === null) treeView.setView(view, { smooth: false }); // opening: the view in use
    else if (key !== usedKey && !editor) treeView.setView(view);     // the admin chose another view
    usedKey = key;
  });

  if (editor) {
    window.esgTree3dView = {
      get: () => treeView.getView(),
      set: view => treeView.setView(view),
      zoomBy: factor => treeView.zoomBy(factor),
      standard: () => treeView.setView({ zoom: 1, ...treeView.standardAngle() }),
    };
  }
}
