(function ($) {

    // Imports ================================================================
    var doc = document,

        kendo = window.kendo,
        Observable = kendo.Observable,
        deepExtend = kendo.deepExtend,

        dataviz = kendo.dataviz,
        renderTemplate = dataviz.renderTemplate,

        d = dataviz.drawing,
        BaseNode = d.BaseNode,

        util = dataviz.util,
        renderAttr = util.renderAttr,
        round = util.round;

    // Constants ==============================================================
    var BUTT = "butt",
        DASH_ARRAYS = dataviz.DASH_ARRAYS,
        NONE = "none",
        SOLID = "solid",
        SQUARE = "square",
        SVG_NS = "http://www.w3.org/2000/svg",
        TRANSPARENT = "transparent",
        UNDEFINED = "undefined";

    // SVG rendering surface ==================================================
    var Surface = Observable.extend({
        init: function(container, options) {
            Observable.fn.init.call(this);

            this.options = deepExtend({}, this.options, options);
            this.bind(this.events, this.options);

            this._root = new RootNode();
            this._appendTo(container);
        },

        options: {
            width: "100%",
            height: "100%"
        },

        events: [
            "click"
        ],

        translate: function(offset) {
            var viewBox = kendo.format(
                "{0} {1} {2} {3}",
                offset.x, offset.y,
                this._width, this._height);

            this.element.setAttribute("viewBox", viewBox);
        },

        draw: function(element) {
            this._root.load([element]);
        },

        clear: function() {
            this._root.clear();
        },

        svg: function() {
            return this._template(this);
        },

        destroy: function() {
            this.clear();
            $(this.element).kendoDestroy();
        },

        _template: renderTemplate(
            "<?xml version='1.0' ?>" +
            "<svg xmlns='" + SVG_NS + "' version='1.1' " +
            "width='#= kendo.dataviz.util.renderSize(d.options.width) #' " +
            "height='#= kendo.dataviz.util.renderSize(d.options.height) #' " +
            "style='position: relative;'>#= d._root.render() #</svg>"
        ),

        _appendTo: function(container) {
            renderSVG(container, this._template(this));
            this.element = container.firstElementChild;
            alignToScreen(this.element);

            this._root.attachTo(this.element);

            var element = $(this.element);
            this._click = $.proxy(this._click, this);
            element.on("click", this._click);

            this._width = element.width();
            this._height = element.height();
        },

        _click: function(e) {
            var node = e.target._kendoNode,
                shape = null;

            if (node) {
                shape = node.srcElement;
            }

            this.trigger("click", {
                shape: shape,
                originalEvent: e
            });
        }
    });

    // SVG Node ================================================================
    var Node = BaseNode.extend({
        load: function(elements) {
            var node = this,
                element = node.element,
                childNode,
                srcElement,
                children,
                i;

            for (i = 0; i < elements.length; i++) {
                srcElement = elements[i];
                children = srcElement.children;

                if (srcElement instanceof d.Group) {
                    childNode = new GroupNode(srcElement);
                } else if (srcElement instanceof d.Path) {
                    childNode = new PathNode(srcElement);
                } else if (srcElement instanceof d.MultiPath) {
                    childNode = new MultiPathNode(srcElement);
                }

                if (children && children.length > 0) {
                    childNode.load(children);
                }

                node.append(childNode);

                if (element) {
                    childNode.attachTo(element);
                }
            }
        },

        attachTo: function(domElement) {
            var container = doc.createElement("div");
            renderSVG(container,
                "<svg xmlns='" + SVG_NS + "' version='1.1'>" +
                this.render() +
                "</svg>"
            );

            var element = container.firstChild.firstChild;
            if (element) {
                domElement.appendChild(element);
                this.setElement(element);
            }
        },

        setElement: function(element) {
            var nodes = this.childNodes,
                childElement,
                i;

            if (this.element) {
                this.element._kendoNode = null;
            }

            this.element = element;
            element._kendoNode = this;

            for (i = 0; i < nodes.length; i++) {
                childElement = element.childNodes[i];
                nodes[i].setElement(childElement);
            }
        },

        template: renderTemplate(
            "#= d.renderChildren() #"
        ),

        render: function() {
            return this.template(this);
        },

        renderChildren: function() {
            var nodes = this.childNodes,
                output = "",
                i;

            for (i = 0; i < nodes.length; i++) {
                output += nodes[i].render();
            }

            return output;
        },

        clear: function() {
            var element = this.element;

            if (element) {
                element.parentNode.removeChild(element);
                this.element = null;
            }

            BaseNode.fn.clear.call(this);
        }
    });

    var RootNode = Node.extend({
        attachTo: function(domElement) {
            this.element = domElement;
        },

        clear: BaseNode.fn.clear
    });

    var GroupNode = Node.extend({
        template: renderTemplate(
            "<g>#= d.renderChildren() #</g>"
        )
    });

    var PathNode = Node.extend({
        geometryChange: function() {
            this.attr("d", this.renderSegments());
            this.invalidate();
        },

        optionsChange: function(e) {
            var name = this.attributeMap[e.field];

            if (name) {
                this.attr(name, e.value);
            } else if (e.field === "visible") {
                this.attr("visibility", e.value ? "visible" : "hidden");
            }

            this.invalidate();
        },

        attributeMap: {
            "fill.color": "fill",
            "stroke.color": "stroke"
        },

        attr: function(name, value) {
            if (this.element) {
                this.element.setAttribute(name, value);
            }
        },

        renderSegments: function() {
            return this.printPath(this.srcElement);
        },

        printPath: function(path) {
            var segments = path.segments;
            if (segments.length > 0) {
                var parts = [],
                    output,
                    i;

                for (i = 0; i < segments.length; i++) {
                    parts.push(segments[i].anchor.toString(1));
                }

                output = "M" + parts.join(" ");
                if (path.options.closed) {
                    output += "Z";
                }

                return output;
            }
        },

        renderStroke: function() {
            var stroke = this.srcElement.options.stroke || {};

            return renderAttr("stroke", stroke.color) +
                   renderAttr("stroke-width", stroke.width) +
                   renderAttr("stroke-opacity", stroke.opacity) +
                   renderAttr("stroke-dasharray", this.renderDashType(stroke)) +
                   renderAttr("stroke-linecap", this.renderLinecap(stroke));
        },

        renderDashType: function (stroke) {
            var width = stroke.width || 1,
                dashType = stroke.dashType;

            if (dashType && dashType != SOLID) {
                var dashArray = DASH_ARRAYS[dashType.toLowerCase()],
                    result = [],
                    i;

                for (i = 0; i < dashArray.length; i++) {
                    result.push(dashArray[i] * width);
                }

                return result.join(" ");
            }
        },

        renderLinecap: function(stroke) {
            var dashType = stroke.dashType,
                lineCap = stroke.lineCap || SQUARE;

            return (dashType && dashType != SOLID) ? BUTT : lineCap;
        },

        renderFill: function() {
            var fill = this.srcElement.options.fill;

            if (fill && fill.color !== TRANSPARENT) {
                return renderAttr("fill", fill.color) +
                       renderAttr("fill-opacity", fill.opacity);
            }

            return renderAttr("fill", NONE);
        },

        renderCursor: function() {
            var cursor = this.srcElement.options.cursor;

            if (cursor) {
                return "cursor:" + cursor + ";";
            }
        },

        renderVisibility: function() {
            if (this.srcElement.options.visible === false) {
                return renderAttr("visibility", "hidden");
            }

            return "";
        },

        template: renderTemplate(
            "<path #= kendo.dataviz.util.renderAttr('style', d.renderCursor()) # " +
            "#= d.renderVisibility() # " +
            "#= kendo.dataviz.util.renderAttr('d', d.renderSegments()) # " +
            "#= d.renderStroke() # " +
            "#= d.renderFill() # " +
            "stroke-linejoin='round'></path>"
        )
    });

    var MultiPathNode = PathNode .extend({
        renderSegments: function() {
            var paths = this.srcElement.paths;

            if (paths.length > 0) {
                var result = [],
                    i;

                for (i = 0; i < paths.length; i++) {
                    result.push(this.printPath(paths[i]));
                }

                return result.join(" ");
            }
        }
    });

    // Helpers ================================================================
    var renderSVG = function(container, svg) {
        container.innerHTML = svg;
    };

    (function() {
        var testFragment = "<svg xmlns='" + SVG_NS + "'></svg>",
            testContainer = doc.createElement("div"),
            hasParser = typeof DOMParser != UNDEFINED;

        testContainer.innerHTML = testFragment;

        if (hasParser && testContainer.firstChild.namespaceURI != SVG_NS) {
            renderSVG = function(container, svg) {
                var parser = new DOMParser(),
                    chartDoc = parser.parseFromString(svg, "text/xml"),
                    importedDoc = doc.adoptNode(chartDoc.documentElement);

                container.innerHTML = "";
                container.appendChild(importedDoc);
            };
        }
    })();

    function alignToScreen(element) {
        var ctm;

        try {
            ctm = element.getScreenCTM ? element.getScreenCTM() : null;
        } catch (e) { }

        if (ctm) {
            var left = - ctm.e % 1,
                top = - ctm.f % 1,
                style = element.style;

            if (left !== 0 || top !== 0) {
                style.left = left + "px";
                style.top = top + "px";
            }
        }
    }

    // Exports ================================================================
    deepExtend(d, {
        svg: {
            GroupNode: GroupNode,
            MultiPathNode: MultiPathNode,
            Node: Node,
            PathNode: PathNode,
            RootNode: RootNode,
            Surface: Surface
        }
    });

})(window.kendo.jQuery);
