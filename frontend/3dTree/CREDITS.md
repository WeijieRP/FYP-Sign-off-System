# Credits

## Terrain and river

- River banks, tributary and island outlines © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The extracted upstream coordinates used here are in `assets/river-source.geojson`. Source features include [Sungai Tembeling](https://www.openstreetmap.org/relation/6085099), [Sungai Tahan](https://www.openstreetmap.org/relation/11009827), and [the island](https://www.openstreetmap.org/way/61713995).
- Elevation data from [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) in Terrarium format. See [source elevation attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
- The Taman Negara valley is rescaled for the wide display. The centre island is smaller and the channels around it are wider. The water depth, low-bank coverage and tree placement are authored for the scene.
- The two authored wooded mountain ridges are bundled as GLB terrain meshes.
- [Forest Floor](https://polyhaven.com/a/forest_floor), [Gravel Floor](https://polyhaven.com/a/gravel_floor), and the photographed [Kloofendal 38d Partly Cloudy Pure Sky](https://polyhaven.com/a/kloofendal_38d_partly_cloudy_puresky) are from Poly Haven, [CC0 1.0](https://polyhaven.com/license).

## Models

- **Ketapang Stage 4** comes from the supplied `Blender_Reference_Tree_7x2_Refined.py`, using its existing geometry, texture maps, and baked vein detail. Leaf surfaces and texture sizes were reduced for real-time display. The forest trees use smaller, lower-detail versions of the same Stage 4 wood geometry and individual textured leaves.
- The red and copper background foliage is inspired by the colour of [Ketapang leaves before they fall](https://biodiversitysg.nparks.gov.sg/our-biodiversity/flowering-plants/trees/ketapang-/).
- The two flowering groves use the existing branch and foliage meshes with authored flower bunches inspired by the [Yellow Flame](https://www.nparks.gov.sg/florafaunaweb/flora/3/0/3056) and [Trumpet Tree](https://www.nparks.gov.sg/florafaunaweb/flora/3/1/3171) found in Singapore.
- [Grass Medium 02](https://polyhaven.com/a/grass_medium_02) by Rico Cilliers, [Fern 02](https://polyhaven.com/a/fern_02) by Rob Tuytel and Rico Cilliers, and [Rock 09](https://polyhaven.com/a/rock_09) by Jenelle van Heerden are from Poly Haven, CC0 1.0. Repacked and optimised for repeated use in the scene.
- [Hawk standing with flight pose](https://www.innerscene.com/tools/library/3d-parts/hawk-standing-with-flight-pose-017c3647) and [Duck mallard](https://www.innerscene.com/tools/library/3d-parts/duck-mallard-dadfaf72) are original Innerscene models, CC0 1.0. Feather meshes were grouped to make flight poses and the duck was adapted for swimming.
- [Barramundi Fish](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BarramundiFish) by Microsoft, CC0 1.0. Texture resolution was reduced and tail motion was added in the scene.

The creek, vines, epiphytes, fungi, wildflowers, soil cutaway and small wildlife are original 3D geometry bundled in the forest GLBs. The [Plantain Squirrel](https://www.nparks.gov.sg/florafaunaweb/fauna/4/8/488) and [Malayan Water Monitor](https://biodiversitysg.nparks.gov.sg/our-biodiversity/reptiles/lizards/malayan-water-monitor/) models are inspired by NParks references. The soil cutaway is illustrative.

## Sound and runtime

- [Stream River Water Up Close](https://freesound.org/people/jackthemurray/sounds/433589/) by jackthemurray, Freesound, CC0 1.0. Trimmed and crossfaded into a loop.
- [Oriental magpie-robin call](https://commons.wikimedia.org/wiki/File:Oriental_magpie-robin_call.ogg) by Saurmandal, Wikimedia Commons, CC0 1.0. Filtered and levelled. The recording is local bird ambience.
- Wind, rain and delayed thunder are synthesised in the browser. Three.js and meshoptimizer licence notices are in `vendor/`.

- Weather skies reuse the credited sky panorama with real-time sky shading. Raindrops use instanced 3D meshes; branching lightning uses authored tube meshes with scene illumination. Rainfall, water rings, lightning and tree lighting are animated in the scene.
