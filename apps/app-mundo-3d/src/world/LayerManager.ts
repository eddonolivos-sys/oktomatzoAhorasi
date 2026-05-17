import {
  Viewer,
  OpenStreetMapImageryProvider,
  ArcGisMapServerImageryProvider,
  IonImageryProvider,
  ImageryLayer,
} from 'cesium';

export type MapLayer = 'satellite' | 'street' | 'topo';

export class LayerManager {
  private viewer: Viewer;
  private current: MapLayer = 'satellite';

  constructor(viewer: Viewer) {
    this.viewer = viewer;
    this.setLayer('satellite');
  }

  async setLayer(layer: MapLayer) {
    if (layer === this.current && this.viewer.imageryLayers.length > 0) return;
    this.current = layer;
    this.viewer.imageryLayers.removeAll();

    switch (layer) {
      case 'satellite':
        await this.loadSatellite();
        break;
      case 'street':
        await this.loadStreet();
        break;
      case 'topo':
        await this.loadTopo();
        break;
    }
  }

  private async loadSatellite() {
    try {
      // Cesium Ion asset 2 = Bing Maps Aerial (requires valid Ion token)
      const provider = await IonImageryProvider.fromAssetId(2);
      this.viewer.imageryLayers.addImageryProvider(provider);
    } catch {
      await this.loadStreet(); // fallback
    }
  }

  private async loadStreet() {
    const provider = new OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
    });
    this.viewer.imageryLayers.addImageryProvider(provider);
  }

  private async loadTopo() {
    try {
      const provider = await ArcGisMapServerImageryProvider.fromUrl(
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer'
      );
      this.viewer.imageryLayers.addImageryProvider(provider);
    } catch {
      await this.loadStreet();
    }
  }

  get activeLayer(): MapLayer {
    return this.current;
  }
}
