import React from 'react';
import { MapComponent } from './MapComponent';

export { MapComponent } from './MapComponent';
export type { MapLayerType, MapProviderTier } from './MapComponent';

export const MapView: React.FC = () => <MapComponent />;

export default MapView;
