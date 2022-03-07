import {
    Cartesian3,
    Viewer,
    Project,
    Cesium3DTileset,
    Matrix3,
    Matrix4
} from '../Source/Cesium.js';

// 创建一个2维的矢量
window.viewer = new Viewer('cesiumContainer', {
    animation: false, //是否显示动画控件(左下方那个)
    baseLayerPicker: true, //是否显示图层选择控件
    geocoder: false, //是否显示地名查找控件
    timeline: false, //是否显示时间线控件
    sceneModePicker: false, //是否显示投影方式控件
    selectionIndicator: false,
    navigationHelpButton: false, //是否显示帮助信息控件
    infoBox: false, //是否显示点击要素之后显示的信息
    homeButton: true //主页按钮，默认true
});

viewer.scene.globe.depthTestAgainstTerrain = true;
viewer.scene.debugShowFramesPerSecond = true;

// var tileset = viewer.scene.primitives.add(new Cesium3DTileset({
//     //url: 'http://58.213.48.101:81/ZHGD/Data/QXDATA/PRJ_BZTBC/1/tileset.json'
//     url: 'http://10.10.10.19:9000/3dtiles/Jiangsu/Nanjing/JianYeQu/20200817JianYeZhongBu/tileset.json'
// }));
// viewer.flyTo(tileset);

// var videoSrc = "../Apps/视频融合/test.mp4";
// var videoType = "video/mp4";
// var videoSrc = "http://123.60.99.58:8081/hls/test.m3u8";
// var videoType = "application/x-mpegURL";
// var videoElement = document.createElement("video");
// videoElement.setAttribute('crossorigin', 'anonymous');
// window.player = videojs(videoElement, {
//     controls: false, // 是否显示控制条
//     preload: 'auto',
//     autoplay: true,
//     loop: true,
//     fluid: true, // 自适应宽高
//     language: 'zh-CN', // 设置语言
//     muted: true, // 是否静音
//     sources: [ // 视频源
//         {
//             src: videoSrc,
//             type: videoType
//         }
//     ]
// });
// player.play();

// var rotation = new Matrix3(
//     -0.466648, 0.0238968, 0.8841,
//     -0.627289, -0.714896, -0.311205,
//     0.623496, -0.698822, 0.348596);
// var viewmatrix = Matrix4.fromRotationTranslation(rotation, new Cartesian3(-2603044.620872717, 4747802.7400483, 3359576.034243803));

// var tar = Matrix4.multiplyByPointAsVector(viewmatrix, new Cartesian3(0, 0, 1), new Cartesian3);
// var up = Matrix4.multiplyByPointAsVector(viewmatrix, new Cartesian3(0, -1, 0), new Cartesian3);

// var project = new Project(viewer, {
//     position: new Cartesian3(-2603044.620872717, 4747802.7400483, 3359576.034243803),
//     diretion: tar,
//     up: up,
//     verticalFov: 45.2398,
//     horizontalFov: 73.6651,
//     near: 1,
//     far: 500,
//     source: videoElement,
//     x_min:0,
//     x_max:0.981407,
//     y_min:0,
//     y_max:0.995689,
//     x_a:1.01895,
//     x_b:0,
//     y_a:1.00433,
//     y_b:0
// });
// project.apply();

// var rotation2 = new Matrix3(
//     0.107102, 0.587256, -0.808263,
//     0.520651, -0.663693, -0.450523,
//     -0.847025, -0.463295, -0.379129);
// var viewmatrix2 = Matrix4.fromRotationTranslation(rotation2, new Cartesian3(-2602842.385767539, 4748029.649904245, 3359790.150005665));
// var tar2 = Matrix4.multiplyByPointAsVector(viewmatrix2, new Cartesian3(0, 0, 1), new Cartesian3);
// var up2 = Matrix4.multiplyByPointAsVector(viewmatrix2, new Cartesian3(0, -1, 0), new Cartesian3);

// var project2;
// project2 = new Project(viewer, {
//     position: new Cartesian3(-2602842.385767539, 4748029.649904245, 3359790.150005665),
//     diretion: tar2,
//     up: up2,
//     verticalFov: 28.1487,
//     horizontalFov: 63.9023,
//     near: 10,
//     far: 500,
//     source: videoElement
// });
// project2.apply();

/**********************************************************************************************************************/

var videoElement = document.querySelector("#videos video");

var viewposition = new Cartesian3(-2541759.182777414, 4780360.433050912, 3360805.786656237);
var distance_tv = new Cartesian3(-0.0025208015440811842, -0.018682260527081048, -0.9998222935607977);
var up = new Cartesian3(-0.47563888715509645, 0.8795086958265218, -0.015234926694673157);

window.project = new Project(viewer, {
    position: viewposition,
    diretion: distance_tv,
    up: up,
    verticalFov: 30,
    horizontalFov: 60,
    near: 10,
    far: 1000,
    source: videoElement,
    hasLine: true
});
project.apply();

viewer.entities.add({
    position: new Cartesian3.fromDegrees(118, 32, 50),
    box: {
        dimensions: new Cartesian3(100, 100, 100)
    }
});

viewer.camera.setView({
    destination: viewposition,
    orientation: {
        direction: distance_tv,
        up: up
    }
});


viewer.entities.add({
    position: new Cartesian3.fromDegrees(117.99, 32, 50),
    box: {
        dimensions: new Cartesian3(100, 100, 100)
    }
});

var viewposition2 = new Cartesian3(-2541179.4014611957, 4780614.798422396, 3360813.8913603327);
var distance_tv2 = new Cartesian3(0.5083662786350557, 0.4320705465614079, -0.7449018522871798);
var up2 = new Cartesian3(-0.2709603946044773, 0.9013384538360156, 0.3378897101012205);

var project2;
project2 = new Project(viewer, {
    position: viewposition2,
    diretion: distance_tv2,
    up: up2,
    verticalFov: 30,
    horizontalFov: 60,
    near: 10,
    far: 1500,
    source: videoElement
});
project2.apply();