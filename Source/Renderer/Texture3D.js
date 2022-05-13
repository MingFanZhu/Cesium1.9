import Cartesian3 from "../Core/Cartesian3.js";
import Check from "../Core/Check.js";
import createGuid from "../Core/createGuid.js";
import defaultValue from "../Core/defaultValue.js";
import defined from "../Core/defined.js";
import destroyObject from "../Core/destroyObject.js";
import DeveloperError from "../Core/DeveloperError.js";
import PixelFormat from "../Core/PixelFormat.js";
import WebGLConstants from "../Core/WebGLConstants.js";
import PixelDatatype from "./PixelDatatype.js";
import Sampler from "./Sampler.js";
import TextureMagnificationFilter from "./TextureMagnificationFilter.js";
import TextureMinificationFilter from "./TextureMinificationFilter.js";

/**
 * @private
 */
function Texture3D(options) {
    options = defaultValue(options, defaultValue.EMPTY_OBJECT);

    //>>includeStart('debug', pragmas.debug);
    Check.defined("options.context", options.context);
    //>>includeEnd('debug');

    var context = options.context;
    var width = options.width;
    var height = options.height;
    var depth = options.depth;
    var source = options.source;

    //判断是否webgl2
    if (!context.webgl2) {
        console.warn("请在初始化cesium时使用webgl2");
        return;
    }

    var pixelFormat = defaultValue(options.pixelFormat, PixelFormat.RGBA);
    var pixelDatatype = defaultValue(options.pixelDatatype, PixelDatatype.UNSIGNED_BYTE);
    var internalFormat = pixelFormat;
    if (pixelDatatype === PixelDatatype.UNSIGNED_BYTE) {
        switch (pixelFormat) {
            case PixelFormat.RGBA:
                internalFormat = WebGLConstants.RGBA8;
                break;
            case PixelFormat.RGB:
                internalFormat = WebGLConstants.RGB8;
                break;
            case PixelFormat.RG:
                internalFormat = WebGLConstants.RG8;
                break;
            case PixelFormat.RED:
                internalFormat = WebGLConstants.R8;
                break;
        }
    }
    if (pixelDatatype === PixelDatatype.FLOAT) {
        switch (pixelFormat) {
            case PixelFormat.RGBA:
                internalFormat = WebGLConstants.RGBA32F;
                break;
            case PixelFormat.RGB:
                internalFormat = WebGLConstants.RGB32F;
                break;
            case PixelFormat.RG:
                internalFormat = WebGLConstants.RG32F;
                break;
            case PixelFormat.RED:
                internalFormat = WebGLConstants.R32F;
                break;
        }
    }
    if (pixelDatatype === PixelDatatype.HALF_FLOAT) {
        switch (pixelFormat) {
            case PixelFormat.RGBA:
                internalFormat = WebGLConstants.RGBA16F;
                break;
            case PixelFormat.RGB:
                internalFormat = WebGLConstants.RGB16F;
                break;
            case PixelFormat.RG:
                internalFormat = WebGLConstants.RG16F;
                break;
            case PixelFormat.RED:
                internalFormat = WebGLConstants.R16F;
                break;
        }
    }

    //>>includeStart('debug', pragmas.debug);
    if (!defined(width) || !defined(height) || !defined(depth)) {
        throw new DeveloperError(
            "需要width、height和depth信息创建纹理"
        );
    }

    if (!PixelFormat.validate(pixelFormat)) {
        throw new DeveloperError("非法的format");
    }

    if (!PixelDatatype.validate(pixelDatatype)) {
        throw new DeveloperError("非法的type");
    }

    if (pixelDatatype === PixelDatatype.FLOAT && !context.floatingPointTexture) {
        throw new DeveloperError(
            "当type为gl.FLOAT类型时, 必须支持OES_texture_float扩展"
        );
    }

    if (
        pixelDatatype === PixelDatatype.HALF_FLOAT &&
        !context.halfFloatingPointTexture
    ) {
        throw new DeveloperError(
            "当type为gl.HALF_FLOAT时, 必须支持OES_texture_half_float扩展"
        );
    }
    //>>includeEnd('debug');

    // Use premultiplied alpha for opaque textures should perform better on Chrome:
    // http://media.tojicode.com/webglCamp4/#20
    var preMultiplyAlpha =
        options.preMultiplyAlpha ||
        pixelFormat === PixelFormat.RGB ||
        pixelFormat === PixelFormat.LUMINANCE;
    var flipY = defaultValue(options.flipY, false);

    var initialized = true;

    var gl = context._gl;
    var textureTarget = gl.TEXTURE_3D;
    var texture = gl.createTexture();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(textureTarget, texture);

    var unpackAlignment = 4;
    if (defined(source) && defined(source.arrayBufferView)) {
        unpackAlignment = PixelFormat.alignmentInBytes(
            pixelFormat,
            pixelDatatype,
            width
        );
    }

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, unpackAlignment);

    if (defined(source)) {
        if (defined(source.arrayBufferView)) {
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

            // Source: typed array
            var arrayBufferView = source.arrayBufferView;
            if (flipY) {
                arrayBufferView = PixelFormat.flipY(
                    arrayBufferView,
                    pixelFormat,
                    pixelDatatype,
                    width,
                    height
                );
            }
            gl.texImage3D(
                textureTarget,
                0,
                internalFormat,
                width,
                height,
                depth,
                0,
                pixelFormat,
                pixelDatatype,
                arrayBufferView
            );
        }
    }
    gl.bindTexture(textureTarget, null);

    var sizeInBytes;
    sizeInBytes = PixelFormat.textureSizeInBytes(
        pixelFormat,
        pixelDatatype,
        width,
        height
    );

    this._id = createGuid();
    this._context = context;
    this._textureFilterAnisotropic = context._textureFilterAnisotropic;
    this._textureTarget = textureTarget;
    this._texture = texture;
    this._pixelFormat = pixelFormat;
    this._pixelDatatype = pixelDatatype;
    this._width = width;
    this._height = height;
    this._depth = depth;
    this._dimensions = new Cartesian3(width, height, depth);
    this._hasMipmap = false;
    this._sizeInBytes = sizeInBytes;
    this._preMultiplyAlpha = preMultiplyAlpha;
    this._flipY = flipY;
    this._initialized = initialized;
    this._sampler = undefined;

    this.sampler = defined(options.sampler) ? options.sampler : new Sampler();
}

/**
 * This function is identical to using the Texture constructor except that it can be
 * replaced with a mock/spy in tests.
 * @private
 */
Texture3D.create = function(options) {
    return new Texture3D(options);
};

Object.defineProperties(Texture3D.prototype, {
    /**
     * A unique id for the texture
     * @memberof Texture.prototype
     * @type {String}
     * @readonly
     * @private
     */
    id: {
        get: function() {
            return this._id;
        },
    },
    /**
     * The sampler to use when sampling this texture.
     * Create a sampler by calling {@link Sampler}.  If this
     * parameter is not specified, a default sampler is used.  The default sampler clamps texture
     * coordinates in both directions, uses linear filtering for both magnification and minification,
     * and uses a maximum anisotropy of 1.0.
     * @memberof Texture.prototype
     * @type {Object}
     */
    sampler: {
        get: function() {
            return this._sampler;
        },
        set: function(sampler) {
            var minificationFilter = sampler.minificationFilter;
            var magnificationFilter = sampler.magnificationFilter;

            var mipmap =
                minificationFilter ===
                TextureMinificationFilter.NEAREST_MIPMAP_NEAREST ||
                minificationFilter ===
                TextureMinificationFilter.NEAREST_MIPMAP_LINEAR ||
                minificationFilter ===
                TextureMinificationFilter.LINEAR_MIPMAP_NEAREST ||
                minificationFilter === TextureMinificationFilter.LINEAR_MIPMAP_LINEAR;

            var context = this._context;
            var pixelDatatype = this._pixelDatatype;

            // float textures only support nearest filtering unless the linear extensions are supported, so override the sampler's settings
            if (
                (pixelDatatype === PixelDatatype.FLOAT &&
                    !context.textureFloatLinear) ||
                (pixelDatatype === PixelDatatype.HALF_FLOAT &&
                    !context.textureHalfFloatLinear)
            ) {
                minificationFilter = mipmap
                    ? TextureMinificationFilter.NEAREST_MIPMAP_NEAREST
                    : TextureMinificationFilter.NEAREST;
                magnificationFilter = TextureMagnificationFilter.NEAREST;
            }

            var gl = context._gl;
            var target = this._textureTarget;

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(target, this._texture);
            gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, minificationFilter);
            gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, magnificationFilter);
            gl.texParameteri(target, gl.TEXTURE_WRAP_S, sampler.wrapS);
            gl.texParameteri(target, gl.TEXTURE_WRAP_T, sampler.wrapT);
            if (defined(this._textureFilterAnisotropic)) {
                gl.texParameteri(
                    target,
                    this._textureFilterAnisotropic.TEXTURE_MAX_ANISOTROPY_EXT,
                    sampler.maximumAnisotropy
                );
            }
            gl.bindTexture(target, null);

            this._sampler = sampler;
        },
    },
    pixelFormat: {
        get: function() {
            return this._pixelFormat;
        },
    },
    pixelDatatype: {
        get: function() {
            return this._pixelDatatype;
        },
    },
    dimensions: {
        get: function() {
            return this._dimensions;
        },
    },
    preMultiplyAlpha: {
        get: function() {
            return this._preMultiplyAlpha;
        },
    },
    flipY: {
        get: function() {
            return this._flipY;
        },
    },
    width: {
        get: function() {
            return this._width;
        },
    },
    height: {
        get: function() {
            return this._height;
        },
    },
    depth: {
        get: function() {
            return this._depth;
        },
    },
    sizeInBytes: {
        get: function() {
            if (this._hasMipmap) {
                return Math.floor((this._sizeInBytes * 4) / 3);
            }
            return this._sizeInBytes;
        },
    },
    _target: {
        get: function() {
            return this._textureTarget;
        },
    },
});

Texture3D.prototype.isDestroyed = function() {
    return false;
};

Texture3D.prototype.destroy = function() {
    this._context._gl.deleteTexture(this._texture);
    return destroyObject(this);
};
export default Texture3D;
