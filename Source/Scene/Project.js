import BoundingRectangle from "../Core/BoundingRectangle.js";
import BoundingSphere from "../Core/BoundingSphere.js";
import Cartesian3 from "../Core/Cartesian3.js";
import Camera from "./Camera.js";
import Color from "../Core/Color.js";
import combine from "../Core/combine.js";
import clone from "../Core/clone.js";
import CesiumMath from "../Core/Math.js";
import ClearCommand from "../Renderer/ClearCommand.js";
import CullFace from "./CullFace.js";
import defined from "../Core/defined.js";
import defaultValue from "../Core/defaultValue.js";
import DrawCommand from "../Renderer/DrawCommand.js";
import Framebuffer from "../Renderer/Framebuffer.js";
import createGuid from "../Core/createGuid.js";
import Intersect from "../Core/Intersect.js";
import Matrix3 from "../Core/Matrix3.js";
import Matrix4 from "../Core/Matrix4.js";
import PixelFormat from "../Core/PixelFormat.js";
import PixelDatatype from "../Renderer/PixelDatatype.js";
import PassState from "../Renderer/PassState.js";
import Pass from "../Renderer/Pass.js";
import PostProcessStage from "../Scene/PostProcessStage.js";
import Quaternion from "../Core/Quaternion.js";
import RenderState from "../Renderer/RenderState.js";
import Renderbuffer from "../Renderer/Renderbuffer.js";
import RenderbufferFormat from "../Renderer/RenderbufferFormat.js";
import ShaderSource from "../Renderer/ShaderSource.js";
import Sampler from "../Renderer/Sampler.js";
import ShaderProgram from "../Renderer/ShaderProgram.js";
import Texture from "../Renderer/Texture.js";
import TextureMinificationFilter from "../Renderer/TextureMinificationFilter.js";

function Project(viewer, option) {
  this._id = createGuid(); //支持多路视频投射需要区分
  this._viewer = viewer;
  this._scene = viewer.scene;
  this._context = this._scene._context;

  //相机和视锥体均不需手动更新，其get属性中包含更新
  //创建深度相机
  this._depthCamera = new Camera(viewer.scene);
  this._depthCamera.position = option.position;
  this._depthCamera.direction = defaultValue(
    option.diretion,
    new Cartesian3(0, 0, 1)
  );
  this._depthCamera.up = defaultValue(option.up, new Cartesian3(0, 1, 0));
  this._horizontalFov = option.horizontalFov;
  this._verticalFov = option.verticalFov;
  this._depthCamera.frustum.near = option.near;
  this._depthCamera.frustum.far = option.far;
  this._size = defaultValue(option.size, 1024); //深度纹理的大小，越大精度越高
  updateAspect.bind(this)(); //设置fov和宽高比

  this._source = option.source; //视频源
  this._hasLine = defaultValue(option.hasLine, false); //是否添加辅助线
  this._line = undefined; //辅助线的entity
  this._lastDepthCameraViewMatrix = new Matrix4(); //记录深度相机的视图矩阵用于判断相机是否变化
  this._lastDepthCameraProjectionMatrix = new Matrix4(); //记录深度相机的投影矩阵用于判断视锥体是否变化
  this._texture = viewer.scene._context.defaultTexture; //视频纹理

  //深度缓冲
  var depthRenderbuffer = new Renderbuffer({
    context: this._context,
    width: this._size,
    height: this._size,
    format: RenderbufferFormat.DEPTH_COMPONENT16,
  });
  //颜色缓冲
  var colorTexture = new Texture({
    context: this._context,
    width: this._size,
    height: this._size,
    pixelFormat: PixelFormat.RGBA,
    pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
    sampler: Sampler.NEAREST,
  });
  //fbo对象
  this._framebuffer = new Framebuffer({
    context: this._context,
    depthRenderbuffer: depthRenderbuffer,
    colorTextures: [colorTexture],
    destroyAttachments: false,
  });
  this._depthTexture = colorTexture; //深度纹理

  //清除命令
  this._clearCommand = new ClearCommand({
    depth: 1.0,
    color: new Color(),
  });
  this._clearPassState = new PassState(this._context); //清除所用的passState
  this._passState = new PassState(this._context); //绘制所用的passState
  this._clearPassState.viewport = new BoundingRectangle(
    0,
    0,
    this._size,
    this._size
  ); //设置视口
  this._passState.viewport = new BoundingRectangle(
    0,
    0,
    this._size,
    this._size
  ); //设置视口
  this._clearCommand.framebuffer = this._framebuffer; //绑定fbo到清除命令
  this._passState.framebuffer = this._framebuffer; //绑定fbo到绘制所用的passState

  this._render = true; //是否渲染，在主视角视线外时不投射
  this._suspend = false; //是否暂停

  //为了修正实际相机成像时的误差而引入的控制参数
  this._x_min = defaultValue(option.x_min, 0);
  this._x_max = defaultValue(option.x_max, 1);
  this._y_min = defaultValue(option.y_min, 0);
  this._y_max = defaultValue(option.y_max, 1);
  this._x_a = defaultValue(option.x_a, 1);
  this._x_b = defaultValue(option.x_b, 0);
  this._y_a = defaultValue(option.y_a, 1);
  this._y_b = defaultValue(option.y_b, 0);
}

//设定水平和垂直fov以及宽高比
function updateAspect() {
  var horizontal = this._horizontalFov * CesiumMath.RADIANS_PER_DEGREE;
  var vertical = this._verticalFov * CesiumMath.RADIANS_PER_DEGREE;
  this._depthCamera.frustum.fov = Math.max(horizontal, vertical);
  var halfH = Math.tan(0.5 * horizontal);
  var halfV = Math.tan(0.5 * vertical);
  this._depthCamera.frustum.aspectRatio = halfH / halfV;
}

Object.defineProperties(Project.prototype, {
  depthCamera: {
    get: function () {
      return this._depthCamera;
    },
  },
  horizontalFov: {
    get: function () {
      return this._horizontalFov;
    },
    set: function (e) {
      this._horizontalFov = e;
      updateAspect.bind(this)(); //更新fov和aspectRadio
    },
  },
  verticalFov: {
    get: function () {
      return this._verticalFov;
    },
    set: function (e) {
      this._verticalFov = e;
      updateAspect.bind(this)();
    },
  },
  near: {
    get: function () {
      return this._depthCamera.frustum.near;
    },
    set: function (e) {
      this._depthCamera.frustum.near = e;
    },
  },
  far: {
    get: function () {
      return this._depthCamera.frustum.far;
    },
    set: function (e) {
      this._depthCamera.frustum.far = e;
    },
  },
  suspend: {
    get: function () {
      return this._suspend;
    },
    set: function (e) {
      this._suspend = e;
    },
  },
});

//清空fbo
function clearFramebuffer(project) {
  project._clearCommand.execute(project._context, project._clearPassState);
}

//应用功能
Project.prototype.apply = function () {
  var that = this;
  this._scene.afterDrawcommad.addEventListener(renderDepth, that);
  this.addPostProcessStage();
};

//渲染深度纹理
function renderDepth() {
  checkVisibility(this); //检查投射区域的可见性
  //主视角可见时
  if (this._render) {
    this.addLine(); //更新辅助线
    clearFramebuffer(this); //清空
    var uniformState = this._context.uniformState;
    uniformState.updateCamera(this._depthCamera); //更新全局uniform值
    copyText(this); //拷贝视频纹理
    var commandList = this._scene.frameState.commandList;
    var depthCamera = this._depthCamera;
    var depthCameraVolume = depthCamera.frustum.computeCullingVolume(
      depthCamera.position,
      depthCamera.direction,
      depthCamera.up
    ); //深度相机的可视范围
    for (var i = 0; i < commandList.length; i++) {
      var command = commandList[i];
      if (
        command.pass === Pass.GLOBE ||
        command.pass === Pass.CESIUM_3D_TILE ||
        command.pass === Pass.OPAQUE ||
        command.pass === Pass.TRANSLUCENT
      ) {
        //没判断castShadows，这样entity不用特意设置可投射阴影
        //处于深度相机的可视范围内
        if (
          depthCameraVolume.computeVisibility(command.boundingVolume) !==
          Intersect.OUTSIDE
        ) {
          var castCommand = createCastDerivedCommand(this, command); //构建投射命令
          uniformState.updatePass(castCommand.pass);
          executeCommand(
            castCommand,
            this._scene,
            this._context,
            this._passState
          ); //执行投射命令
        }
      }
    }
    this._postStage.enabled = true; //后处理可用
  } else {
    this._postStage.enabled = false; //后处理不可用
  }
}

//检查投射区域的可见性
function checkVisibility(project) {
  var boundingSphere = new BoundingSphere();
  boundingSphere.center = project._depthCamera.positionWC;
  boundingSphere.radius = project.far;
  if (
    project._suspend ||
    project._scene.frameState.cullingVolume.computeVisibility(
      boundingSphere
    ) === Intersect.OUTSIDE
  ) {
    project._render = false;
  } else {
    project._render = true;
  }
}

//拷贝视频纹理
function copyText(project) {
  //在视频已经可用时
  if (defined(project._source) && project._source.readyState >= 2) {
    if (project._texture !== project._context.defaultTexture) {
      project._texture.destroy(); //释放上一次的纹理
    }
    //新创建纹理
    project._texture = new Texture({
      context: project._context,
      source: project._source,
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.LINEAR,
        magnificationFilter: TextureMinificationFilter.LINEAR,
      }), //线性采样，其效率较高
    });
  }
}

//创建投射命令
function createCastDerivedCommand(project, command) {
  var castShader;
  var castRenderState;
  var castUniformMap;
  var result = undefined;

  if (defined(command.projects)) {
    result = command.projects[project._id]; //缓存
  } else {
    command.projects = [];
  }

  if (defined(result)) {
    castShader = result.shaderProgram;
    castRenderState = result.renderState;
    castUniformMap = result.uniformMap;
  }

  result = DrawCommand.shallowClone(command, result);
  result.castShadows = true;
  result.receiveShadows = false;

  if (
    !defined(castShader) ||
    result.castShaderProgramId !== command.shaderProgram.id
  ) {
    var isTerrain = command.pass === Pass.GLOBE;
    var isOpaque = command.pass !== Pass.TRANSLUCENT;
    var shaderProgram = command.shaderProgram;
    var vertexShaderSource = shaderProgram.vertexShaderSource;
    var fragmentShaderSource = shaderProgram.fragmentShaderSource;

    var castVS = createVertexShader(vertexShaderSource, isTerrain);
    var castFS = createFragmentShader(fragmentShaderSource, isOpaque);
    if (typeof castVS === "string") {
      castVS = new ShaderSource({
        sources: [castVS],
      });
    }

    if (typeof castFS === "string") {
      castFS = new ShaderSource({
        sources: [castFS],
      });
    }
    var vertexShaderText = castVS.createCombinedVertexShader(project._context);
    var fragmentShaderText = castFS.createCombinedFragmentShader(
      project._context
    );

    castShader = new ShaderProgram({
      gl: project._context._gl,
      logShaderCompilation: project._context.logShaderCompilation,
      debugShaders: project._context.debugShaders,
      vertexShaderSource: castVS,
      vertexShaderText: vertexShaderText,
      fragmentShaderSource: castFS,
      fragmentShaderText: fragmentShaderText,
      attributeLocations: shaderProgram._attributeLocations,
    });

    castRenderState = RenderState.fromCache({
      cull: {
        enabled: true,
        face: CullFace.BACK,
      },
      depthTest: {
        enabled: true,
      },
      colorMask: {
        red: true,
        green: true,
        blue: true,
        alpha: true,
      },
      depthMask: true,
      polygonOffset: {
        enabled: false,
        factor: 1.1,
        units: 4.0,
      },
    });

    var cullEnabled = command.renderState.cull.enabled;
    if (!cullEnabled) {
      castRenderState = clone(castRenderState, false);
      castRenderState.cull = clone(castRenderState.cull, false);
      castRenderState.cull.enabled = false;
      castRenderState = RenderState.fromCache(castRenderState);
    }

    castUniformMap = combineUniforms(project, command.uniformMap);
  }

  result.shaderProgram = castShader;
  result.renderState = castRenderState;
  result.uniformMap = castUniformMap;
  result.castShaderProgramId = command.shaderProgram.id; //记录当前command的shaderProgramId
  command.projects[project._id] = result; //缓存下来

  return result;
}

//创建顶点着色器代码
function createVertexShader(vs, isTerrain) {
  var defines = vs.defines.slice(0);
  var sources = vs.sources.slice(0);

  defines.push("SHADOW_MAP");

  if (isTerrain) {
    defines.push("GENERATE_POSITION");
  }

  var positionVaryingName = ShaderSource.findPositionVarying(vs);
  var hasPositionVarying = defined(positionVaryingName);

  if (!hasPositionVarying) {
    var length = sources.length;
    for (var j = 0; j < length; ++j) {
      sources[j] = ShaderSource.replaceMain(sources[j], "czm_shadow_cast_main");
    }

    var shadowVS =
      "varying vec3 v_positionEC; \n" +
      "void main() \n" +
      "{ \n" +
      "    czm_shadow_cast_main(); \n" +
      "    v_positionEC = (czm_inverseProjection * gl_Position).xyz; \n" +
      "}";
    sources.push(shadowVS);
  }

  return new ShaderSource({
    defines: defines,
    sources: sources,
  });
}

//创建片元着色器代码
function createFragmentShader(fs, isOpaque) {
  var defines = fs.defines.slice(0);
  var sources = fs.sources.slice(0);

  var positionVaryingName = ShaderSource.findPositionVarying(fs);
  var hasPositionVarying = defined(positionVaryingName);
  if (!hasPositionVarying) {
    positionVaryingName = "v_positionEC";
  }

  var length = sources.length;
  for (var i = 0; i < length; ++i) {
    sources[i] = ShaderSource.replaceMain(sources[i], "czm_shadow_cast_main");
  }

  var fsSource = "";
  if (!hasPositionVarying) {
    fsSource += "varying vec3 v_positionEC; \n";
  }
  fsSource += "uniform float u_far; \n";

  if (isOpaque) {
    fsSource += "void main() \n" + "{ \n";
  } else {
    fsSource +=
      "void main() \n" +
      "{ \n" +
      "    czm_shadow_cast_main(); \n" +
      "    if (gl_FragColor.a == 0.0) \n" +
      "    { \n" +
      "       discard; \n" +
      "    } \n";
  }

  fsSource +=
    "    float distance = length(" +
    positionVaryingName +
    "); \n" +
    "    if (distance >= u_far) \n" +
    "    { \n" +
    "        discard; \n" +
    "    } \n" +
    "    distance /= u_far; // 远平面 \n" +
    "    gl_FragColor = czm_packDepth(distance); \n";
  fsSource += "} \n";

  sources.push(fsSource);

  return new ShaderSource({
    defines: defines,
    sources: sources,
  });
}

//添加uniform变量
function combineUniforms(project, uniformMap) {
  var mapUniforms = {
    u_far: function () {
      return project.far;
    },
  };
  return combine(uniformMap, mapUniforms, false);
}

//执行命令
function executeCommand(command, scene, context, passState) {
  var frameState = scene._frameState;

  if (defined(scene.debugCommandFilter) && !scene.debugCommandFilter(command)) {
    return;
  }

  if (command instanceof ClearCommand) {
    command.execute(context, passState);
    return;
  }

  if (frameState.useLogDepth && defined(command.derivedCommands.logDepth)) {
    command = command.derivedCommands.logDepth.command;
  }

  var passes = frameState.passes;
  if (
    !passes.pick &&
    !passes.depth &&
    scene._hdr &&
    defined(command.derivedCommands) &&
    defined(command.derivedCommands.hdr)
  ) {
    command = command.derivedCommands.hdr.command;
  }

  if (passes.pick || passes.depth) {
    if (
      passes.pick &&
      !passes.depth &&
      defined(command.derivedCommands.picking)
    ) {
      command = command.derivedCommands.picking.pickCommand;
      command.execute(context, passState);
      return;
    } else if (defined(command.derivedCommands.depth)) {
      command = command.derivedCommands.depth.depthOnlyCommand;
      command.execute(context, passState);
      return;
    }
  }

  if (
    frameState.shadowState.lightShadowsEnabled &&
    command.receiveShadows &&
    defined(command.derivedCommands.shadows)
  ) {
    // If the command receives shadows, execute the derived shadows command.
    // Some commands, such as OIT derived commands, do not have derived shadow commands themselves
    // and instead shadowing is built-in. In this case execute the command regularly below.
    command.derivedCommands.shadows.receiveCommand.execute(context, passState);
  } else {
    command.execute(context, passState);
  }
}

//添加后处理
Project.prototype.addPostProcessStage = function () {
  var fs = /*glsl*/ `
        precision highp float;
        uniform sampler2D colorTexture;
        uniform sampler2D depthTexture;
        uniform sampler2D u_projectTexture;
        uniform sampler2D u_depthCameraTexture;
        uniform mat4 u_toDepthCameraMatrix;
        uniform mat4 u_depthCameraProjectionMatrix;
        uniform mat4 u_depthCameraProjectionMatrixInverse;
        uniform float u_far;

        uniform float u_x_min;
        uniform float u_x_max;
        uniform float u_y_min;
        uniform float u_y_max;
        uniform float u_x_a;
        uniform float u_x_b;
        uniform float u_y_a;
        uniform float u_y_b;

        varying vec2 v_textureCoordinates;

        //获取屏幕空间像素的z值
        float getScreenDepth(in vec4 depth){
            float z_window = czm_unpackDepth(depth);
            z_window = czm_reverseLogDepth(z_window);
            if (z_window > 0.0 && z_window < 1.0){
                float n_range = czm_depthRange.near;
                float f_range = czm_depthRange.far;
                return (2.0 * z_window - n_range - f_range) / (f_range - n_range);
            }
            return 0.0;
        }

        //计算在眼坐标系的坐标
        vec4 toEye(in vec2 uv, in float depth)
        {
            vec2 xy = vec2((uv.x * 2.0 - 1.0),(uv.y * 2.0 - 1.0));
            vec4 posInCamera =czm_inverseProjection * vec4(xy, depth, 1.0);
            posInCamera =posInCamera / posInCamera.w;
            return posInCamera;
        }

        //获取深度纹理上的深度
        float getDepthFromShadowMap(in sampler2D shadowTexture, in vec4 texCoord)
        {
            return czm_unpackDepth(texture2D(shadowTexture, texCoord.xy));
        }

        void main(){
            //在左下角绘制深度纹理
            // if(v_textureCoordinates.x<0.2&&v_textureCoordinates.y<0.2){
            //     gl_FragColor=texture2D(u_depthCameraTexture, v_textureCoordinates*5.0);
            //     return;
            // }
            float depth = getScreenDepth(texture2D(depthTexture, v_textureCoordinates));
            vec4 color = texture2D(colorTexture, v_textureCoordinates);//原始图像
            //太空不作处理
            if(depth == 0.0){
                gl_FragColor = color;
                return;
            }

            vec4 viewPos = toEye(v_textureCoordinates,depth);//眼坐标
            float depthBias = 0.0005;//深度偏移量
            depthBias *= max(-viewPos.z * 0.01, 1.0);//根据眼坐标的z值动态更改偏移量
            vec4 depthViewPos = u_toDepthCameraMatrix * viewPos;//深度相机系下的坐标
            depthViewPos/=depthViewPos.w;
            vec4 depthProjPos = u_depthCameraProjectionMatrix * depthViewPos;//深度相机投影后的坐标
            depthProjPos /= depthProjPos.w;
            depthProjPos.xyz = depthProjPos.xyz * 0.5 + 0.5;//转换到标准设备空间

            //在深度相机的可视范围内
            if (depthProjPos.x > u_x_min && depthProjPos.x < u_x_max && depthProjPos.y > u_y_min && depthProjPos.y < u_y_max && depthProjPos.z>0.0 && depthProjPos.z < 1.0) {
                float depthInMap = getDepthFromShadowMap(u_depthCameraTexture, depthProjPos);
                float depth=length(depthViewPos.xyz)/u_far-depthBias;
                //深度相机可见的区域
                if (depthInMap > depth) {
                    vec4 color1=texture2D(u_projectTexture, vec2(u_x_a*depthProjPos.x+u_x_b,u_y_a*depthProjPos.y+u_y_b));
                    gl_FragColor = color1;
                    return;
                }
                else{
                    gl_FragColor = color;
                    return;
                }
            }else{
                gl_FragColor = color;
                return;
            }
        }
    `;
  var that = this;
  var PostStage = new PostProcessStage({
    fragmentShader: fs,
    uniforms: {
      u_projectTexture: function () {
        return that._texture;
      },
      u_depthCameraTexture: function () {
        return that._depthTexture;
      },
      u_toDepthCameraMatrix: function () {
        return Matrix4.multiply(
          that._depthCamera.viewMatrix,
          that._viewer.camera.inverseViewMatrix,
          new Matrix4()
        );
      },
      u_depthCameraProjectionMatrix: function () {
        return that._depthCamera.frustum.projectionMatrix;
      },
      u_depthCameraProjectionMatrixInverse: function () {
        return Matrix4.inverse(
          that._depthCamera.frustum.projectionMatrix,
          new Matrix4()
        );
      },
      u_far: function () {
        return that.far;
      },
      u_x_min: function () {
        return that._x_min;
      },
      u_x_max: function () {
        return that._x_max;
      },
      u_y_min: function () {
        return that._y_min;
      },
      u_y_max: function () {
        return that._y_max;
      },
      u_x_a: function () {
        return that._x_a;
      },
      u_x_b: function () {
        return that._x_b;
      },
      u_y_a: function () {
        return that._y_a;
      },
      u_y_b: function () {
        return that._y_b;
      },
    },
  });
  this._postStage = PostStage;
  this._viewer.scene.postProcessStages.add(this._postStage);
};

//添加辅助线
Project.prototype.addLine = function () {
  //需要添加辅助线
  if (this._hasLine) {
    var viewMatrix = this._depthCamera.viewMatrix;
    var projectionMatrix = this._depthCamera.frustum.projectionMatrix;
    var viewChanged = !Matrix4.equals(
      viewMatrix,
      this._lastDepthCameraViewMatrix
    ); //深度相机是否变动
    var projectChanged = !Matrix4.equals(
      projectionMatrix,
      this._lastDepthCameraProjectionMatrix
    ); //视锥体是否变动
    //相机或视锥体有变动
    if (viewChanged || projectChanged) {
      //记录变动后的视图矩阵和投影矩阵
      this._lastDepthCameraViewMatrix = viewMatrix.clone();
      this._lastDepthCameraProjectionMatrix = projectionMatrix.clone();

      var mat4 = this._depthCamera.inverseViewMatrix; //逆视图矩阵
      var mat3 = Matrix4.getMatrix3(mat4, new Matrix3()); //获取旋转矩阵，也是以深度相机为原点，以视线负方向为z轴、以上方向为y轴的坐标系
      var rotate = Matrix3.fromRotationX(-CesiumMath.PI_OVER_TWO); //绕x轴顺时针旋转90度的旋转矩阵
      var rotated = Matrix3.multiply(mat3, rotate, new Matrix3()); //得到以视线方向为y轴，上方向为z轴的坐标系
      //若已经存在entity，则清除
      if (defined(this._line)) {
        this._viewer.entities.remove(this._line);
      }
      this._line = this._viewer.entities.add({
        position: this._depthCamera.position,
        orientation: Quaternion.fromRotationMatrix(rotated, new Quaternion()), //由坐标系得到旋转四元数，主要是为了得到于深度相机方向一致的椭球
        ellipsoid: {
          radii: new Cartesian3(
            this._depthCamera.frustum.far,
            this._depthCamera.frustum.far,
            this._depthCamera.frustum.far
          ), //外径
          innerRadii: new Cartesian3(
            this._depthCamera.frustum.near,
            this._depthCamera.frustum.near,
            this._depthCamera.frustum.near
          ), //内径
          minimumClock:
            CesiumMath.PI_OVER_TWO -
            this._horizontalFov * CesiumMath.RADIANS_PER_DEGREE * 0.5, //水平方向，以x轴方向为起点，绕z轴顺时针方向
          maximumClock:
            CesiumMath.PI_OVER_TWO +
            this._horizontalFov * CesiumMath.RADIANS_PER_DEGREE * 0.5,
          minimumCone:
            CesiumMath.PI_OVER_TWO -
            this._verticalFov * CesiumMath.RADIANS_PER_DEGREE * 0.5, //垂直方向，以z轴方向为起点，绕x轴顺时针方向
          maximumCone:
            CesiumMath.PI_OVER_TWO +
            this._verticalFov * CesiumMath.RADIANS_PER_DEGREE * 0.5,
          fill: false, //不填充
          outline: true, //绘制边线
          outlineColor: Color.YELLOW,
          stackPartitions: 4,
          slicePartitions: 4,
        },
      });
    }
  }
};

//销毁
Project.prototype.destroy = function () {
  this._scene.afterDrawcommad.removeEventListener(renderDepth);
  this._viewer.scene.postProcessStages.remove(this._postStage);
  if (defined(this._line)) {
    this._viewer.entities.remove(this._line);
  }
};

export default Project;
