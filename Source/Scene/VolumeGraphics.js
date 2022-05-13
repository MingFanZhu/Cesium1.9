import BoxGeometry from "../Core/BoxGeometry.js"
import GeometryPipeline from "../Core/GeometryPipeline.js";
import ShaderProgram from "../Renderer/ShaderProgram.js";
import DrawCommand from "../Renderer/DrawCommand.js";
import VertexArray from "../Renderer/VertexArray.js";
import BufferUsage from "../Renderer/BufferUsage.js";
import RenderState from "../Renderer/RenderState.js";
import Pass from "../Renderer/Pass.js";
import combine from "../Core/combine.js";
import BoundingSphere from "../Core/BoundingSphere.js";

/**
 * 体渲染对象
 * 
 * @alias VolumeGraphics
 * @constructor
 *
 * @param {Object} options Object with the following properties:
 * @param {Object} options.boxGeometry Object with the following properties:
 * @param {Cartesian3} options.boxGeometry.minimum 最小点
 * @param {Cartesian3} options.boxGeometry.maximum 最大点
 * @param {VertexFormat} [options.boxGeometry.vertexFormat=VertexFormat.DEFAULT] 需要的顶点数据
 * @param {Matrix4} options.modelMatrix 世界矩阵
 * @param {String} options.vertexShaderSource 顶点着色器代码
 * @param {String} options.fragmentShaderSource 片元着色器代码
 * @param {Object} options.uniformmap 静态变量
 * @param {Boolean} options.translucent 半透明
 * @param {Object} options.texture 3D纹理
 */
function VolumeGraphics(options) {
    var boxGeometry = new BoxGeometry(options.boxGeometry);
    var geometry = BoxGeometry.createGeometry(boxGeometry);
    this._geometry = geometry;

    this._modelMatrix = options.modelMatrix;

    this._vs = options.vertexShaderSource;
    this._fs = options.fragmentShaderSource;

    var uniform = {
        u_BoxMin: function(){return options.boxGeometry.minimum},
        u_BoxMax: function(){return options.boxGeometry.maximum},
        u_Texture_3D: function(){return options.texture}
    }
    this._texture=options.texture;

    this._uniformmap = combine(uniform, options.uniformmap);

    this._translucent = options.translucent;

    this._drawCommand = undefined;
}

/**
 * 
 * @param {Object} frameState 
 */
VolumeGraphics.prototype.update = function(frameState) {
    if (!this._drawCommand) {
        var context = frameState.context;
        var attributeLocations = GeometryPipeline.createAttributeLocations(this._geometry);
        var vertexArray = VertexArray.fromGeometry({
            context: context,
            geometry: this._geometry,
            attributeLocations: attributeLocations,
            bufferUsage: BufferUsage.STATIC_DRAW
        });
        this._vertexArray=vertexArray;
        var shaderProgram = ShaderProgram.fromCache({
            context: context,
            vertexShaderSource: this._vs,
            fragmentShaderSource: this._fs,
            attributeLocations: attributeLocations
        });
        this._shaderProgram=shaderProgram;
        var randerState = RenderState.fromCache({
            depthTest: {
                enabled: true,
            }
        });
        var pass = this._translucent ? Pass.TRANSLUCENT : Pass.OPAQUE;
        var drawCommand = new DrawCommand({
            boundingVolume: this._geometry.boundingSphere,
            modelMatrix: this._modelMatrix,
            primitiveType: this._geometry.primitiveType,
            vertexArray: vertexArray,
            shaderProgram: shaderProgram,
            uniformMap: this._uniformmap,
            renderState: randerState,
            pass: pass
        });

        this._drawCommand=drawCommand;
    }

    //更新包围盒
    var boundingSphere=BoundingSphere.transform(this._geometry.boundingSphere,this._modelMatrix,new BoundingSphere);
    this._drawCommand.boundingVolume=boundingSphere;

    frameState.commandList.push(this._drawCommand);
}

/**
 * 销毁
 */
VolumeGraphics.prototype.destroy=function(){
    this._vertexArray.destroy();
    this._shaderProgram.destroy();
    this._texture.destroy();
    return destroyObject(this);
}
export default VolumeGraphics;