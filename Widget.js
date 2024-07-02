define([
  "dojo/_base/declare",
  "jimu/BaseWidget",
  "dojo/store/Memory",
  "dijit/form/ComboBox",
  "esri/tasks/query",
  "esri/tasks/QueryTask",
  "esri/geometry/Circle",
  "esri/geometry/Point",
  "esri/SpatialReference",
  "esri/symbols/SimpleLineSymbol",
  "esri/symbols/SimpleMarkerSymbol",
  "esri/symbols/SimpleFillSymbol",
  "esri/graphic",
  "esri/Color",
  "dojo/_base/array",
  "dojo/dom",
  "dojo/on",
  "esri/geometry/geometryEngine",
  "esri/layers/GraphicsLayer",
  "dojo/_base/lang",
  "dojo/dom-construct",
  "dojo/dom-style",
  "esri/dijit/Search",
  "esri/geometry/geodesicUtils",
  "dojo/domReady!",
], function (
  declare,
  BaseWidget,
  Memory,
  ComboBox,
  Query,
  QueryTask,
  Circle,
  Point,
  SpatialReference,
  SimpleLineSymbol,
  SimpleMarkerSymbol,
  SimpleFillSymbol,
  Graphic,
  Color,
  array,
  dom,
  on,
  geometryEngine,
  GraphicsLayer,
  lang,
  domConstruct,
  domStyle,
  Search,
  geodesicUtils
) {
  //To create a widget, you need to derive from BaseWidget.
  return declare([BaseWidget], {
    baseClass: "jimu-widget-NearbyTool",
    mapclickEvt: null,

    postCreate: function () {
      this.inherited(arguments);
      console.log("postCreate");
    },

    startup: function () {
      this.inherited(arguments);
      console.log("startup");
      this.highlightGraphicsLayer = new GraphicsLayer();
      this.map.addLayer(this.highlightGraphicsLayer);
      this.createLayersDropDown();
      this.createFieldsDropdown();
      on(this.nearbyToolInputButton, "click", (e) => {
        this.mapclickEvt?.remove();
        if (this._mapMoveHandler) {
          this._mapMoveHandler.remove();
          this._mapMoveHandler = null;
          this._mapTooltip.style.display = "none";
        }
        this._mapMoveHandler = this.own(
          this.map.on("mouse-move", lang.hitch(this, this._onMapMouseMove))
        )[0];
        this.own(
          this.map.on(
            "mouse-out",
            lang.hitch(this, function () {
              domStyle.set(this._mapTooltip, "display", "none");
            })
          )
        );
        this.mapclickEvt = this.map.on("click", (evt) => {
          this.mapClickEvent(evt);
        });
      });
      //create tool-tip to be shown on map move
      this._mapTooltip = domConstruct.create(
        "div",
        {
          class: "esriCTMapTooltip",
          innerHTML: "Click on map",
        },
        this.map.container
      );
      domStyle.set(this._mapTooltip, "position", "fixed");
      domStyle.set(this._mapTooltip, "display", "none");
      this.map.on("zoom-end", (evt) => {
        this.createLayersDropDown();
      });
      new Search({ map: this.map }, "nearbyToolSearch");
    },

    _onMapMouseMove: function (evt) {
      // update the tooltip as the mouse moves over the map
      var px, py;
      if (evt.clientX || evt.pageY) {
        px = evt.clientX;
        py = evt.clientY;
      } else {
        px = evt.clientX + document.body.scrollLeft - document.body.clientLeft;
        py = evt.clientY + document.body.scrollTop - document.body.clientTop;
      }
      domStyle.set(this._mapTooltip, "display", "none");
      domStyle.set(this._mapTooltip, {
        left: px + 15 + "px",
        top: py + "px",
      });
      domStyle.set(this._mapTooltip, "display", "");
    },

    mapClickEvent: function (event) {
      console.log("Map click event");
      this.mapclickEvt?.remove();
      this.highlightGraphicsLayer.clear();
      // Create buffer using geometryEngine
      var buffer = geometryEngine.buffer(
        event.mapPoint,
        parseInt(this.nearbyToolInputBufferText.value),
        this.nearbyToolBufferUnitSelect.value
      );
      var bufferSymbol = new SimpleFillSymbol();
      bufferSymbol.setColor(new Color([0, 0, 255, 0.5]));
      this.highlightGraphicsLayer.add(new Graphic(buffer, bufferSymbol));
      this.queryFeatures(buffer);
    },

    queryFeatures: function (bufferGeometry) {
      var selectedLayerId = dijit.byId("nearbyToolLayerSelect").item.id;
      var selectedField = dijit.byId("nearbyToolFieldSelect").item.id;
      var selectedLayer = this.map.getLayer(selectedLayerId);

      var query = new Query();
      query.geometry = bufferGeometry;
      query.returnGeometry = true;
      query.outFields = ["*"];

      selectedLayer.queryFeatures(query, (result) => {
        this.selectedfeatures = result.features;
        var features = result.features;

        var featureCount = 0;
        var highlightSymbol = null;
        if(selectedLayer.geometryType === "esriGeometryPoint"){
          featureCount = features.length;
          highlightSymbol = new SimpleMarkerSymbol();
        }else if (selectedLayer.geometryType === "esriGeometryPolyline") {
          featureCount = this.calculateLengthData(features) + this.nearbyToolBufferUnitSelect.selectedOptions[0].innerHTML;
          highlightSymbol = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID,new Color([255,0,0]),3);
        }else if (selectedLayer.geometryType === "esriGeometryPolygon") {
          featureCount = this.calculateTotalArea(features) + "Sq" + this.nearbyToolBufferUnitSelect.selectedOptions[0].innerHTML;
          highlightSymbol = new SimpleFillSymbol();
        }

        features.forEach((feature) => {
          var graphic = new Graphic(feature.geometry, highlightSymbol);
          this.highlightGraphicsLayer.add(graphic);
        });

        //get subtypes
        var subtypesData = this.calculateSubtypeData(features,selectedField);
        
        // Display the data in the table
        this.createResultTable(
          subtypesData.subtypeCounts,
          subtypesData.areaData,
          subtypesData.lengthData,
          featureCount,
          selectedLayer.name
        );

        // Handle map move and tooltip (assuming you have these functions)
        if (this._mapMoveHandler) {
          this._mapMoveHandler.remove();
          this._mapMoveHandler = null;
        }
        if (this._mapTooltip) {
          this._mapTooltip.style.display = "none";
        }
      });
    },

    calculateSubtypeData: function (features, selectedField) {
      var subtypeFeatures = {};
      features.forEach((feature) => {
        var subtype = feature.attributes[selectedField];
        if (!subtypeFeatures[subtype]) {
          subtypeFeatures[subtype] = {
            features: [],
            areaData: 0, // Initialize for polygons
            lengthData: 0  // Initialize for polylines
          };
        }
    
        subtypeFeatures[subtype].features.push(feature);
    
        const featureLength = parseFloat(this.calculateLengthData([feature]));
        subtypeFeatures[subtype].lengthData += featureLength;
      });
    
      return {
        subtypeCounts: this.calculateSubtypeCounts(features, selectedField),
        areaData: this.calculateSubtypeWiseAreaData(features, selectedField), // Assuming for polygons
        lengthData: subtypeFeatures // Separate object containing length data by subtype
      };
    },

    calculateSubtypeCounts: function (features, selectedField) {
      var subtypeCounts = {};
      features.forEach((feature) => {
        var subtype = feature.attributes[selectedField];
        if (subtypeCounts[subtype]) {
          subtypeCounts[subtype]++;
        } else {
          subtypeCounts[subtype] = 1;
        }
      });
      return subtypeCounts;
    },

    calculateTotalArea:function(features){
      var areaData = 0;
      features.forEach((feature) => {
        // Calculate geodesic area using geometryEngine.geodesicArea
        const featureArea = geometryEngine.geodesicArea(feature.geometry);
        // Add feature length to total length
        areaData += featureArea;
      });
      return (areaData.toFixed(2));
    },

    calculateSubtypeWiseAreaData: function (features, areaAttribute) {
      var areaData = {};
      features.forEach((feature) => {
        if (feature.geometry.type === "polygon") {
          // Calculate geodesic area using geometryEngine.geodesicArea
          const featureArea = geometryEngine.geodesicArea(feature.geometry,"square-"+this.nearbyToolBufferUnitSelect.value);
    
          // Add feature area to subtype area (if areaAttribute is set)
          if (feature.attributes.hasOwnProperty(areaAttribute)) {
            const subtype = feature.attributes[areaAttribute];
            if (!areaData[subtype]) {
              areaData[subtype] = 0;
            }
            areaData[subtype] += featureArea;
          } else {
            // Handle case where areaAttribute is not available
            console.warn("calculateAreaData: areaAttribute not found in feature attributes. Skipping area calculation.");
          }
        } else {
          console.warn("calculateAreaData: Feature geometry is not a polygon. Skipping area calculation.");
        }
      });
      return areaData;
    },

    calculateLengthData: function (features) {
      var lengthData = 0;
      features.forEach((feature) => {
        // Check if the feature geometry is a polyline
        if (feature.geometry.type === "polyline") {
          // Calculate geodesic length
          const featureLength = geometryEngine.geodesicLength(
            feature.geometry,
            this.nearbyToolBufferUnitSelect.value
          );
          // Add feature length to total length
          lengthData += featureLength;
        }
      });
      return (lengthData.toFixed(2));
    },

    createResultTable: function (
      subtypeCounts,
      areaData,
      lengthData,
      featureCount,
      layerName
    ) {
      var resultDiv = document.getElementById("resultDiv");
      resultDiv.innerHTML = ""; // Clear previous content

      // Create a table element
      var table = document.createElement("table");
      table.id = "nearbyToolTableId";

      //Table Name
      var headerMainRow = table.insertRow();
      var headerMainCell = headerMainRow.insertCell();
      headerMainCell.textContent = "ASSET SUMMARY DATA";
      headerMainCell.colSpan = 4;
      headerMainCell.style.fontWeight = "bold";
      headerMainCell.style.textAlign = "center";

      // Header row with selected layer name
      var headerRow = table.insertRow();
      var headerCell = headerRow.insertCell();
      headerCell.textContent = layerName;
      headerCell.colSpan = 2; // Span across two columns

      var totalCountCell2 = headerRow.insertCell();
      totalCountCell2.textContent = featureCount;
      totalCountCell2.style.fontWeight = "bold";
      totalCountCell2.colSpan = 2; // Span across two columns

      // Separator row (optional)
      var separatorRow = table.insertRow();
      var separatorCell = separatorRow.insertCell();
      separatorCell.textContent = "Type"; // Or use a horizontal line element (optional)
      separatorCell.style.textAlign = "center"; // Center separator text
      separatorCell.style.fontWeight = "bold"; // Italicize separator (optional)

      var separatorCell2 = separatorRow.insertCell();
      separatorCell2.textContent = "Count"; // Or use a horizontal line element (optional)
      separatorCell2.style.textAlign = "center"; // Center separator text
      separatorCell2.style.fontWeight = "bold"; // Italicize separator (optional)

      var separatorCell3 = separatorRow.insertCell();
      separatorCell3.textContent = "Length"; // Or use a horizontal line element (optional)
      separatorCell3.style.textAlign = "center"; // Center separator text
      separatorCell3.style.fontWeight = "bold"; // Italicize separator (optional)

      var separatorCell4 = separatorRow.insertCell();
      separatorCell4.textContent = "Area"; // Or use a horizontal line element (optional)
      separatorCell4.style.textAlign = "center"; // Center separator text
      separatorCell4.style.fontWeight = "bold"; // Italicize separator (optional)

      // Subtype-wise data with counts, area (if available), and length (if available)
      for (var subtype in subtypeCounts) {
        var dataRow = table.insertRow();
        var dataCell1 = dataRow.insertCell();
        dataCell1.textContent = subtype;
        var dataCell2 = dataRow.insertCell();
        dataCell2.textContent = subtypeCounts[subtype];
        var dataCell3 = dataRow.insertCell();
        dataCell3.textContent = lengthData[subtype] ? (lengthData[subtype].lengthData.toFixed(2) + this.nearbyToolBufferUnitSelect.selectedOptions[0].innerHTML) : 0;
        var dataCell4 = dataRow.insertCell();
        dataCell4.textContent = areaData[subtype] ? (areaData[subtype].toFixed(2))+"sq-"+this.nearbyToolBufferUnitSelect.selectedOptions[0].innerHTML : 0;
      }

      // Add the table to the resultDiv
      resultDiv.appendChild(table);

      // Add an export button (optional)
      var divButton = document.createElement("div");
      divButton.className = "btnContainer";

      var exportButton = document.createElement("button");
      exportButton.className = "nearbyToolBtn";
      exportButton.textContent = "Export"; // Make clear it's not true Excel
      exportButton.addEventListener(
        "click",
        lang.hitch(this, this.exportTableToCSV)
      );

      divButton.appendChild(exportButton);
      resultDiv.appendChild(divButton);
    },

    createLayersDropDown: function () {
      var layers = this.map.getLayersVisibleAtScale().filter(function (layer) {
        return (
          layer.geometryType === "esriGeometryPoint" ||
          layer.geometryType === "esriGeometryPolyline" ||
          layer.geometryType === "esriGeometryPolygon"
        );
      });

      var layerData = layers.map(function (layer, index) {
        return { name: layer.arcgisProps.title, id: layer.id };
      });
      // Get the existing dropdown widget with the ID (if it exists)
      var existingDropdown = dijit.byId("nearbyToolLayerSelect");
      if (existingDropdown) {
        var stateStore = new Memory({
          data: layerData,
        });
        existingDropdown.store = stateStore;
      } else {
        this.fillDropdowns(layerData, "nearbyToolLayerSelect", () => {
          this.createFieldsDropdown(); // Call directly on change
        });
      }
    },

    createFieldsDropdown: function () {
      var selectedLayerId = dijit.byId("nearbyToolLayerSelect")?.item?.id;
      // Get the existing dropdown widget with the ID (if it exists)
      var existingDropdown = dijit.byId("nearbyToolFieldSelect");
      if (selectedLayerId) {
        var selectedLayer = this.map.getLayer(selectedLayerId);
        var fields = selectedLayer.fields;

        var fieldData = fields.map(function (field, index) {
          return { name: field.alias || field.name, id: field.name };
        });
        // Destroy the existing dropdown if present
        if (existingDropdown) {
          var stateStore = new Memory({
            data: fieldData,
          });
          existingDropdown.store = stateStore;
          existingDropdown.value = fieldData[0].name;
        } else {
          this.fillDropdowns(fieldData, "nearbyToolFieldSelect", null);
        }
      }
    },

    fillDropdowns: function (data, htmlElement, onChangeHandler) {
      var stateStore = new Memory({
        data: data,
      });

      var comboBox = new ComboBox(
        {
          id: htmlElement,
          name: htmlElement,
          value: data[0].name, // Set initial value
          store: stateStore,
          searchAttr: "name",
          onChange: onChangeHandler || function () {}, // Default empty function
        },
        htmlElement
      );
      dijit.byId(htmlElement).item = {};
      dijit.byId(htmlElement).item.id = data[0].id;
    },

    // Function to export table data to CSV format
    exportTableToCSV: function () {
      var csvContent = "";
      csvContent += "SUMMARY DATA";
      csvContent += "\n";
      var table = document.getElementById("nearbyToolTableId");
      // Add header row to CSV content
      csvContent += `Name,Count\n`;

      // Loop through each table row and add data to CSV content
      for (var i = 1; i < table.rows.length; i++) {
        // Skip the header row (index 0)
        var row = table.rows[i];
        var cells = row.cells;
        for (var j = 0; j < cells.length; j++) {
          var cellValue = cells[j].textContent;
          csvContent += cellValue + (j === cells.length - 1 ? "\n" : ","); // Add comma separator or newline
        }
      }
      csvContent += "\n";
      csvContent += "TOTAL DATA";
      csvContent += "\n";
      //Loop through features and add data to CSV content
      var features = this.selectedfeatures;
      var sampleFeature = this.selectedfeatures[0];
      if (sampleFeature) {
        csvContent += "";
        for (var key in sampleFeature.attributes) {
          if (key !== "OBJECTID" && key !== "geometry") {
            csvContent += key + ",";
          }
        }
        csvContent += "\n";
      }
      features.forEach((feature) => {
        // Add other desired feature properties separated by commas
        for (var key in feature.attributes) {
          if (key !== "OBJECTID" && key !== "geometry") {
            // Skip ID and geometry
            csvContent += feature.attributes[key] + ",";
          }
        }
        csvContent += "\n"; // Add newline after each feature
      });

      // Trigger download or use the CSV content for further processing
      var layerName = document.getElementById("nearbyToolLayerSelect").value;
      var encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
      var link = document.createElement("a");
      link.href = encodedUri;
      link.download = layerName + "_Summary_data.csv";
      link.click();
    },

    onOpen: function () {
      console.log("onOpen");
      this.map.setInfoWindowOnClick(false);
    },

    onClose: function () {
      console.log("onClose");
      this.map.setInfoWindowOnClick(true);
      // Handle map move and tooltip
      if (this._mapMoveHandler) {
        this._mapMoveHandler.remove();
        this._mapMoveHandler = null;
      }
      if (this._mapTooltip) {
        this._mapTooltip.style.display = "none";
      }
      this.mapclickEvt?.remove();
      this.highlightGraphicsLayer.clear();
      document.getElementById("resultDiv").innerHTML = "";
    },

    onMinimize: function () {
      console.log("onMinimize");
    },

    onMaximize: function () {
      console.log("onMaximize");
    },

    onSignIn: function (credential) {
      /* jshint unused:false*/
      console.log("onSignIn");
    },

    onSignOut: function () {
      console.log("onSignOut");
    },
  });
});
