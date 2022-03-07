var simpleStart = /*glsl*/ `
    vec4 sampleAndBlend(
        vec4 previousColor,
        sampler2D textureToSample,
        vec2 tileTextureCoordinates,
        vec4 textureCoordinateRectangle,
        vec4 textureCoordinateTranslationAndScale,
        float textureAlpha,
        float textureNightAlpha,
        float textureDayAlpha,
        float textureBrightness,
        float textureContrast,
        float textureHue,
        float textureSaturation,
        float textureOneOverGamma,
        float split,
        vec4 colorToAlpha,
        //add by zmf begin
        float nightBlend,
        float textureInvert,
        float textureGrayscale,
        float textureSepia)
        //add by zmf end
    {
        // This crazy step stuff sets the alpha to 0.0 if this following condition is true:
        //    tileTextureCoordinates.s < textureCoordinateRectangle.s ||
        //    tileTextureCoordinates.s > textureCoordinateRectangle.p ||
        //    tileTextureCoordinates.t < textureCoordinateRectangle.t ||
        //    tileTextureCoordinates.t > textureCoordinateRectangle.q
        // In other words, the alpha is zero if the fragment is outside the rectangle
        // covered by this texture.  Would an actual 'if' yield better performance?
        vec2 alphaMultiplier = step(textureCoordinateRectangle.st, tileTextureCoordinates);
        textureAlpha = textureAlpha * alphaMultiplier.x * alphaMultiplier.y;

        alphaMultiplier = step(vec2(0.0), textureCoordinateRectangle.pq - tileTextureCoordinates);
        textureAlpha = textureAlpha * alphaMultiplier.x * alphaMultiplier.y;

        #if defined(APPLY_DAY_NIGHT_ALPHA) && defined(ENABLE_DAYNIGHT_SHADING)
            textureAlpha *= mix(textureDayAlpha, textureNightAlpha, nightBlend);
        #endif

        vec2 translation = textureCoordinateTranslationAndScale.xy;
        vec2 scale = textureCoordinateTranslationAndScale.zw;
        vec2 textureCoordinates = tileTextureCoordinates * scale + translation;
        vec4 value = texture2D(textureToSample, textureCoordinates);
        vec3 color = value.rgb;
        float alpha = value.a;

        #ifdef APPLY_COLOR_TO_ALPHA
            vec3 colorDiff = abs(color.rgb - colorToAlpha.rgb);
            colorDiff.r = max(max(colorDiff.r, colorDiff.g), colorDiff.b);
            alpha = czm_branchFreeTernary(colorDiff.r < colorToAlpha.a, 0.0, alpha);
        #endif

        #ifdef APPLY_SPLIT
            float splitPosition = czm_imagerySplitPosition;
            // Split to the left
            if (split < 0.0 && gl_FragCoord.x > splitPosition) {
            alpha = 0.0;
            }
            // Split to the right
            else if (split > 0.0 && gl_FragCoord.x < splitPosition) {
            alpha = 0.0;
            }
        #endif
`;
var simpleEnd = /*glsl*/ `
        float sourceAlpha = alpha * textureAlpha;
        float outAlpha = mix(previousColor.a, 1.0, sourceAlpha);
        outAlpha += sign(outAlpha) - 1.0;

        vec3 outColor = mix(previousColor.rgb * previousColor.a, color, sourceAlpha) / outAlpha;

        // When rendering imagery for a tile in multiple passes,
        // some GPU/WebGL implementation combinations will not blend fragments in
        // additional passes correctly if their computation includes an unmasked
        // divide-by-zero operation,
        // even if it's not in the output or if the output has alpha zero.
        //
        // For example, without sanitization for outAlpha,
        // this renders without artifacts:
        //   if (outAlpha == 0.0) { outColor = vec3(0.0); }
        //
        // but using czm_branchFreeTernary will cause portions of the tile that are
        // alpha-zero in the additional pass to render as black instead of blending
        // with the previous pass:
        //   outColor = czm_branchFreeTernary(outAlpha == 0.0, vec3(0.0), outColor);
        //
        // So instead, sanitize against divide-by-zero,
        // store this state on the sign of outAlpha, and correct on return.

        return vec4(outColor, max(outAlpha, 0.0));
    }
`;

var filters = {};

filters["gamma"] = /*glsl*/ `
    #if !defined(APPLY_GAMMA)
        vec4 tempColor = czm_gammaCorrect(vec4(color, alpha));
        color = tempColor.rgb;
        alpha = tempColor.a;
    #else
        color = pow(color, vec3(textureOneOverGamma));
    #endif
`;

filters["brightness"] = /*glsl*/ `
    #ifdef APPLY_BRIGHTNESS
        color = mix(vec3(0.0), color, textureBrightness);
    #endif
`;

filters["contrast"] = /*glsl*/ `
    #ifdef APPLY_CONTRAST
        color = mix(vec3(0.5), color, textureContrast);
    #endif
`;

filters["hue"] = /*glsl*/ `
    #ifdef APPLY_HUE
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = color.g < color.b ? vec4(color.bg, K.wz) : vec4(color.gb, K.xy);
        vec4 q = color.r < p.x ? vec4(p.xyw, color.r) : vec4(color.r, p.yzx);

        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        vec3 hsv = vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);

        hsv.x+=(textureHue/180.0)*czm_pi/6.0;
        hsv.x=mod(hsv.x,czm_pi/3.0);

        vec4 K2 = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p2 = abs(fract(hsv.xxx + K2.xyz) * 6.0 - K2.www);
        color = hsv.z * mix(K2.xxx, clamp(p2 - K2.xxx, 0.0, 1.0), hsv.y);
    #endif
`;

filters["invert"] = /*glsl*/ `
    #ifdef APPLY_INVERT
        color=((1.0-textureInvert)*color)+(vec3(1.0)-color)*textureInvert;
    #endif
`;

filters["grayscale"] = /*glsl*/ `
    #ifdef APPLY_GRAYSCALE
        float mix_color=0.299*color.r+0.578*color.g+0.114*color.b;
        color=mix(color,vec3(mix_color), textureGrayscale);
    #endif
`;

filters["sepia"] = /*glsl*/ `
    #ifdef APPLY_SEPIA
        float output_red = (color.r * .393) + (color.g *.769) + (color.b * .189);
        float output_green = (color.r * .349) + (color.g *.686) + (color.b * .168);
        float output_blue = (color.r * .272) + (color.g *.534) + (color.b * .131);
        color=mix(color,vec3(output_red,output_green,output_blue), textureSepia);
    #endif
`;

filters["saturation"] = /*glsl*/ `
    #ifdef APPLY_SATURATION
        color = czm_saturation(color, textureSaturation);
    #endif
`;

export default function concat(filterIndex) {
  var fs = simpleStart;
  for (var key in filterIndex) {
    fs += filters[filterIndex[key]];
  }
  fs += simpleEnd;
  return fs;
}
