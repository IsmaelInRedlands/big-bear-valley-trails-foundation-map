export default async function install(app) {
  const mount = app.getMount("elevation-profile-tool");
  mount.style.width = "100%";
  mount.style.minWidth = "0";
  mount.style.minHeight = "0";
  mount.style.height = "100%";
  mount.style.position = "relative";
  mount.style.display = "block";
  mount.style.overflow = "visible";
  mount.style.padding = "0";

  const title = document.createElement("div");
  title.textContent = "Click a trail to see its elevation profile.";
  title.style.position = "absolute";
  title.style.zIndex = "5";
  title.style.top = "6px";
  title.style.left = "10px";
  title.style.maxWidth = "45%";
  title.style.boxSizing = "border-box";
  title.style.padding = "2px 7px";
  title.style.borderRadius = "3px";
  title.style.background = "var(--calcite-color-foreground-1)";
  title.style.color = "var(--calcite-color-text-1)";
  title.style.fontSize = "0.8rem";
  title.style.lineHeight = "1.2";
  title.style.fontWeight = "600";
  title.style.whiteSpace = "nowrap";
  title.style.overflow = "hidden";
  title.style.textOverflow = "ellipsis";
  title.style.pointerEvents = "none";

  const widgetHost = document.createElement("div");
  widgetHost.style.position = "relative";
  widgetHost.style.width = "100%";
  widgetHost.style.height = "100%";
  widgetHost.style.minWidth = "0";
  widgetHost.style.minHeight = "180px";
  widgetHost.style.flex = "1 1 auto";
  widgetHost.style.overflow = "visible";
  mount.replaceChildren(widgetHost, title);

  const trailLayerIds = ["alltrails_435", "gpx_1992", "gpx_1172", "gpx_9183", "gpx_1164", "gpx_5808", "gpx_6933", "gpx_2890", "gpx_7698"];
  for (const id of trailLayerIds) {
    const layer = app.layers[id];
    if (layer && "popupEnabled" in layer) layer.popupEnabled = false;
  }

  const actionMap = app.view.navigation.actionMap;
  const previousSecondaryDrag = actionMap.dragSecondary;
  actionMap.dragSecondary = "pan";
  const [ElevationProfile, ElevationLayer, Graphic] = await Promise.all([
    app.import("esri/widgets/ElevationProfile"),
    app.import("esri/layers/ElevationLayer"),
    app.import("esri/Graphic")
  ]);
  const elevationSource = new ElevationLayer({
    url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer",
    title: "ArcGIS World Elevation"
  });
  await elevationSource.load();
  const widget = new ElevationProfile({
    view: app.view,
    container: widgetHost,
    profiles: [{ type: "query", title: "Elevation", source: elevationSource }],
    visibleElements: { sketchButton: false, selectButton: false, settingsButton: false }
  });

  let requestNumber = 0;
  const showTrailProfile = async ({ graphic, selection }) => {
    const currentRequest = ++requestNumber;
    title.textContent = "Loading elevation profile…";
    const layerId = selection?.layerId;
    const layer = app.layers[layerId];
    if (!layer || layer.type !== "feature") {
      title.textContent = "The clicked trail layer is unavailable.";
      return { ok: false, reason: "The clicked trail layer is unavailable." };
    }
    await layer.load();
    const objectIds = selection?.ids?.length ? selection.ids : (graphic?.getObjectId ? [graphic.getObjectId()] : []);
    let chosen = graphic;
    if (objectIds.length) {
      const query = layer.createQuery();
      query.objectIds = objectIds;
      query.outFields = ["*"];
      query.returnGeometry = true;
      const result = await layer.queryFeatures(query);
      if (currentRequest !== requestNumber) return { ok: false, superseded: true };
      if (result.features?.length) chosen = result.features[0];
    }
    const geometry = chosen?.geometry;
    if (!geometry || geometry.type !== "polyline") {
      title.textContent = "No trail line geometry was found.";
      return { ok: false, reason: "The clicked feature has no usable trail line geometry." };
    }
    const attributes = chosen.attributes ?? graphic?.attributes ?? {};
    let trailName = String(attributes.name ?? attributes.Name ?? layer.title ?? "Selected trail");
    if (!attributes.name && !attributes.Name && layer.title) trailName = layer.title.replace(/^Loop\s+/i, "");
    const difficulty = String(attributes.Difficulty ?? attributes.difficulty ?? "").trim();
    title.textContent = difficulty ? `${trailName} · ${difficulty}` : trailName;
    widget.input = new Graphic({ geometry, attributes: { name: trailName, difficulty } });
    return {
      ok: true,
      layerId,
      trailName,
      difficulty: difficulty || null,
      profileVisible: widget.visible,
      widgetInputSet: !!widget.input,
      geometryType: geometry.type,
      pathCount: geometry.paths?.length ?? 0,
      titleText: title.textContent
    };
  };
  app.actions.register("show-trail-profile", showTrailProfile);

  app.onCleanup(() => {
    widget.destroy();
    if (actionMap.dragSecondary === "pan") actionMap.dragSecondary = previousSecondaryDrag;
    mount.replaceChildren();
  });
  return {
    widget: "ElevationProfile",
    sourceLoaded: elevationSource.loaded,
    profileSource: "ArcGIS World Elevation Terrain3D ImageServer",
    titleOverlay: true,
    profileHostMinHeight: widgetHost.style.minHeight,
    clickLayers: trailLayerIds,
    trailPopupsDisabled: trailLayerIds.filter(id => app.layers[id]?.popupEnabled === false),
    rightButtonDragAction: actionMap.dragSecondary
  };
}