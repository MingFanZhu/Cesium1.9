import Texture from "../Renderer/Texture.js";
import PixelFormat from "../Core/PixelFormat.js";
import PixelDatatype from "../Renderer/PixelDatatype.js";
import Sampler from "../Renderer/Sampler.js";
import Framebuffer from "../Renderer/Framebuffer.js";
import ClearCommand from "../Renderer/ClearCommand.js";
import Color from "../Core/Color.js";
import Cesium3DTileset from "./Cesium3DTileset.js";
import ShaderProgram from "../Renderer/ShaderProgram.js";
import ShaderSource from "../Renderer/ShaderSource.js";
import defaultValue from "../Core/defaultValue.js";
import PostProcessStage from "./PostProcessStage.js";
import DrawCommand from "../Renderer/DrawCommand.js";

/**
 * @alias EdgeMode
 * @constructor
 * 
 * @param {Viewer} viewer 
 * @param {Object} options
 * @param {Cesium3DTileset} options.target
 * @param {Number} [options.lineWidth=1.0] 线宽
 * @param {Color} [options.edgeColor] 线的颜色
 * @param {Number} [options.thresholdAngle=45] 法线夹角，单位度
 * @param {Number} [options.alpha=1.0] 透明度
 */
function EdgeMode(viewer, options) {
  this._viewer = viewer;
  this._scene = viewer.scene;
  this._context = this._scene._context;

  var width = this._context.drawingBufferWidth;
  var height = this._context.drawingBufferHeight;
  this._normalTexture = new Texture({
    context: this._context,
    width: width,
    height: height,
    pixelFormat: PixelFormat.RGBA,
    pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
    sampler: Sampler.NEAREST,
  });
  this._depthStencilTexture = new Texture({
    context: this._context,
    width: width,
    height: height,
    pixelFormat: PixelFormat.DEPTH_STENCIL,
    pixelDatatype: PixelDatatype.UNSIGNED_INT_24_8,
    sampler: Sampler.NEAREST,
  });
  this._framebuffer = new Framebuffer({
    context: this._context,
    colorTextures: [this._normalTexture],
    depthStencilTexture: this._depthStencilTexture,
    destroyAttachments: false,
  });
  this._clearCommand = new ClearCommand({
    depth: 1.0,
    color: new Color(1.0, 1.0, 1.0, 0.0), //透明度需要是0
  });
  this._clearCommand.framebuffer = this._framebuffer;

  this._target = options.target;
  this._lineWidth = defaultValue(options.lineWidth, 1.0);
  this._edgeColor = defaultValue(options.edgeColor, new Color(1.0, 1.0, 0.0));
  this._thresholdAngle = defaultValue(options.thresholdAngle, 45);
  this._thresholdAngle = (this._thresholdAngle / 180) * Math.PI;
  this._alpha = defaultValue(options.alpha, 1.0);

  this._shaderPrograms = {};

  this._scene.afterDrawcommad.addEventListener(render, this);
  addPostProcessStage.bind(this)();
}

Object.defineProperties(EdgeMode.prototype, {
  lineWidth: {
    get: function () {
      return this._lineWidth;
    },
    set: function (e) {
      this._lineWidth = e;
    },
  },
  edgeColor: {
    get: function () {
      return this._edgeColor;
    },
    set: function (e) {
      this._edgeColor = e;
    },
  },
  thresholdAngle: {
    get: function () {
      return (this._thresholdAngle / Math.PI) * 180;
    },
    set: function (e) {
      this._thresholdAngle = (e / 180) * Math.PI;
    },
  },
  alpha: {
    get: function () {
      return this._alpha;
    },
    set: function (e) {
      this._alpha = e;
    },
  },
});

//保持fbo纹理大小与canvas framebuffer一致，因为viewport是在主渲染循环设定的（0,0,canvas.width,canvas.height）
function updateFrameBuffer() {
  var width = this._context.drawingBufferWidth;
  var height = this._context.drawingBufferHeight;

  if (
    this._normalTexture.width === width &&
    this._normalTexture.height === height
  ) {
    return;
  }

  this._framebuffer.destroy();
  this._framebuffer = undefined;
  this._normalTexture.destroy();
  this._normalTexture = undefined;
  this._depthStencilTexture.destroy();
  this._depthStencilTexture = undefined;

  this._normalTexture = new Texture({
    context: this._context,
    width: width,
    height: height,
    pixelFormat: PixelFormat.RGBA,
    pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
    sampler: Sampler.NEAREST,
  });
  this._depthStencilTexture = new Texture({
    context: this._context,
    width: width,
    height: height,
    pixelFormat: PixelFormat.DEPTH_STENCIL,
    pixelDatatype: PixelDatatype.UNSIGNED_INT_24_8,
    sampler: Sampler.NEAREST,
  });
  this._framebuffer = new Framebuffer({
    context: this._context,
    colorTextures: [this._normalTexture],
    depthStencilTexture: this._depthStencilTexture,
    destroyAttachments: false,
  });
  this._clearCommand.framebuffer = this._framebuffer;
}

//根据target获取update后的drawcommand
function getDrawCommands(target) {
  var commands = [];
  if (target instanceof Cesium3DTileset) {
    var cacheNode = tileset._cache._sentinel.next;
    while (cacheNode != undefined) {
      var tile = cacheNode.item;
      var nodeCommands = tile._content._model._nodeCommands;
      for (var i = 0; i < nodeCommands.length; i++) {
        commands.push(nodeCommands[i].command);
      }
      cacheNode = cacheNode.next;
    }
  }
  //...更多target类型有待添加
  return commands;
}

function containsString(shaderSource, string) {
  const sources = shaderSource.sources;
  const sourcesLength = sources.length;
  for (let i = 0; i < sourcesLength; ++i) {
    if (sources[i].indexOf(string) !== -1) {
      return true;
    }
  }
  return false;
}

//克隆一个drawcommand,删去pickid并重新给定shaderprograme
function createAndDraw(command) {
  var frameState = this._scene._frameState;
  var shaderProgram = command.shaderProgram;
  if (command.edgemode != undefined) {
    command.edgemode.framebuffer = this._framebuffer;
    frameState.commandList.push(command.edgemode);
  } else {
    var vertexShaderSource = shaderProgram.vertexShaderSource;
    var normalVS = undefined;
    //先找有没有'v_normal'
    var positionVaryingName = containsString(vertexShaderSource, ["v_normal"]);
    if (positionVaryingName) {
      normalVS = vertexShaderSource;
    } else {
      var defines = vertexShaderSource.defines.slice(0);
      var sources = vertexShaderSource.sources.slice(0);
      var length = sources.length;
      for (var j = 0; j < length; ++j) {
        sources[j] = ShaderSource.replaceMain(
          sources[j],
          "czm_normal_replace_main"
        );
      }
      //找有没有'a_normal'
      var va = shaderProgram.vertexAttributes;
      var vs = ``;
      if (va.a_normal != undefined) {
        vs = /*glsl*/ `
                    varying vec3 v_normal;
                    void main(){
                        czm_normal_replace_main();
                        v_normal=a_normal;
                    }
                `;
      } else {
        vs = /*glsl*/ `
                    varying vec3 v_normal;
                    void main(){
                        czm_normal_replace_main();
                        v_normal=vec3(0.);
                    }
                `;
      }
      sources.push(vs);
      normalVS = new ShaderSource({
        defines: defines,
        sources: sources,
      });
    }

    var normalFS = undefined;
    var fs = /*glsl*/ `
            varying vec3 v_normal;
            void main(){
                if(length(v_normal)>0.){
                    gl_FragColor=vec4( v_normal,1.);
                }
            }
        `;
    normalFS = new ShaderSource({
      defines: [],
      sources: [fs],
    });

    var normalPrograme = ShaderProgram.fromCache({
      context: this._context,
      vertexShaderSource: normalVS,
      fragmentShaderSource: normalFS,
      attributeLocations: shaderProgram._attributeLocations,
    });

    var edgemodeCommand = DrawCommand.shallowClone(command);
    edgemodeCommand.shaderProgram = normalPrograme;
    edgemodeCommand.framebuffer = this._framebuffer; //drawcommand有fbo时优先使用，否则使用passstate中的fbo
    edgemodeCommand.pickId = undefined;
    command.edgemode = edgemodeCommand;
    frameState.commandList.push(edgemodeCommand); //塞到主循环里面,但是framebuffer使用自定义的
  }
}

function render() {
  updateFrameBuffer.bind(this)(); //更新fbo
  var commands = getDrawCommands(this._target);
  this._clearCommand.execute(this._context); //清空fbo
  for (var i = 0; i < commands.length; i++) {
    var command = commands[i];
    createAndDraw.bind(this)(command);
  }
}

//边缘检测后处理
function addPostProcessStage() {
  var fs = /*glsl*/ `
        uniform sampler2D colorTexture;
        uniform sampler2D depthTexture;
        uniform vec2 colorTextureDimensions;
        uniform sampler2D normalTexture;//渲染结果颜色纹理
        uniform sampler2D depthStencilTexture;
        uniform float lineWidth;//线宽
        uniform vec3 edgeColor;//颜色
        
        varying vec2 v_textureCoordinates;
        uniform float thresholdAngle;
        uniform float alpha;

        float lengthSq(vec3 v){
            return v.x * v.x + v.y * v.y + v.z * v.z;
        }

        float normal_angleTo(vec3 a,vec3 b){
            float denominator =  sqrt(  lengthSq(a) * lengthSq(b) );
            if ( denominator == 0. ) return czm_pi / 2.;
            float theta = dot(a, b ) / denominator;
            return  acos(  clamp( theta, - 1., 1. ) );
        }

        float compareNormal(vec4 n1,vec4 n2){
            if(  abs (  normal_angleTo( n1.xyz , n2.xyz ) ) < thresholdAngle ){
                return 0.;
            }else{
                return 1.;
            }
        }

        float compareDepth(const in vec2 uv){
          float maskDepth = czm_readDepth( depthStencilTexture, uv);
          float nonDepth = czm_readDepth( depthTexture, uv);
          return maskDepth>nonDepth?1.:0.;
       }

        void main(){
            vec2 vUv=v_textureCoordinates;
            vec2 invSize = lineWidth / colorTextureDimensions;
            vec4 uvOffset = vec4(1.0, 0.0, 0.0, 1.0) * vec4(invSize, invSize);
            
            vec4 c1 = texture2D( normalTexture, vUv + uvOffset.xy);
            vec4 c2 = texture2D( normalTexture, vUv - uvOffset.xy);
            vec4 c3 = texture2D( normalTexture, vUv + uvOffset.yw);
            vec4 c4 = texture2D( normalTexture, vUv - uvOffset.yw);
            
            float diff_edge1 = (c1.a - c2.a)*0.5;
            float diff_edge2 = (c3.a - c4.a)*0.5;
            float d_edge = length( vec2(diff_edge1, diff_edge2) );

            float diff_normal1 = compareNormal(c1,c2)*0.5;
            float diff_normal2 = compareNormal(c3,c4)*0.5;
            float d_normal = length( vec2(diff_normal1, diff_normal2) );

            float d=fract(d_edge+d_normal);

            float dp1 = compareDepth( vUv + uvOffset.xy);
            float dp2 = compareDepth( vUv - uvOffset.xy);
            float dp3 = compareDepth( vUv + uvOffset.yw);
            float dp4 = compareDepth( vUv - uvOffset.yw);

            float a1 = min(dp1, dp2);
            float a2 = min(dp3, dp4);
            float visibilityFactor = min(a1, a2);
            float visable = 1.0 - visibilityFactor > 0.001 ? 1.0 : 0.0;
            d*=visable;
            d*=alpha;
            
            vec4 color=texture2D( colorTexture, vUv);
            vec4 edgeColor = vec4(edgeColor, 1.0) * vec4(d);

            gl_FragColor=color+edgeColor;
        }  
    `;
  var that = this;
  var PostStage = new PostProcessStage({
    fragmentShader: fs,
    uniforms: {
      lineWidth: function () {
        return that._lineWidth;
      },
      edgeColor: function () {
        return that._edgeColor;
      },
      normalTexture: function () {
        return that._normalTexture;
      },
      depthStencilTexture: function () {
        return that._depthStencilTexture;
      },
      thresholdAngle: function () {
        return that._thresholdAngle;
      },
      alpha: function () {
        return that._alpha;
      },
    },
  });
  this._viewer.scene.postProcessStages.add(PostStage);
  that._postStage = PostStage;
}

/**
 * 销毁
 */
EdgeMode.prototype.destroy = function () {
  this._scene.afterDrawcommad.removeEventListener(render);
  this._viewer.scene.postProcessStages.remove(this._postStage);
};

export default EdgeMode;
