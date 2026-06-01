import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// Fix default icons for webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const roseIcon = new L.DivIcon({
    className: "custom-pin",
    html: `<div style="width:20px;height:20px;border-radius:50%;background:#9C433E;border:3px solid #FAFAF7;box-shadow:0 4px 10px rgba(42,17,20,.35)"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
});

const noirIcon = new L.DivIcon({
    className: "custom-pin",
    html: `<div style="width:20px;height:20px;border-radius:50%;background:#2A1114;border:3px solid #FAFAF7;box-shadow:0 4px 10px rgba(42,17,20,.35)"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
});

export default function MapView({ markers = [], height = 360, center }) {
    const c = center
        || (markers[0] && [markers[0].lat, markers[0].lng])
        || [41.3111, 69.2797]; // Tashkent

    return (
        <div className="rounded-xl overflow-hidden border border-line" style={{ height }} data-testid="map-view">
            <MapContainer center={c} zoom={11} scrollWheelZoom={true} style={{ height: "100%", width: "100%" }}>
                <TileLayer
                    attribution='&copy; OpenStreetMap'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {markers.map((m, idx) => (
                    <Marker key={idx} position={[m.lat, m.lng]} icon={m.kind === "worker" ? noirIcon : roseIcon}>
                        <Popup>
                            <div style={{fontFamily:'Outfit'}}>
                                <strong>{m.title || ""}</strong>
                                <div style={{fontSize:12, color:"#594F4D"}}>{m.subtitle || ""}</div>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
}
