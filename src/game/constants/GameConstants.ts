import configJson from './game-constants-config.json';

export enum BallColor {
    BROWN = 'brown',
    ORANGE = 'orange',
    LIGHT_PURPLE = 'light_purple',
    GRAY = 'gray',
    PINK = 'pink',
    PURPLE = 'purple',
    RED = 'red',
    GREEN = 'green',
    FLUORESCENT_GREEN = 'fluorescent_green',
    BLUE = 'blue',
    CYAN = 'cyan',
    YELLOW = 'yellow'
}

export const BALL_COLORS = Object.values(BallColor);

/** 游戏仅使用的 4 色调色板：红、绿、蓝、黄 */
export const RESTRICTED_PALETTE: BallColor[] = [
  BallColor.RED,
  BallColor.GREEN,
  BallColor.BLUE,
  BallColor.YELLOW,
];

/** 液体颜色默认色值（可被 output-config.json 的 liquidColors 覆盖） */
export const DEFAULT_LIQUID_COLORS: { [key in BallColor]: number } = {
    [BallColor.BROWN]: 0xDB0D0A,
    [BallColor.ORANGE]: 0x80B903,
    [BallColor.LIGHT_PURPLE]: 0x057ED5,
    [BallColor.GRAY]: 0xF4B30B,
    [BallColor.PINK]: 0xDB0D0A,
    [BallColor.PURPLE]: 0x80B903,
    [BallColor.RED]: 0xDB0D0A,
    [BallColor.GREEN]: 0x80B903,
    [BallColor.FLUORESCENT_GREEN]: 0x057ED5,
    [BallColor.BLUE]: 0x057ED5,
    [BallColor.CYAN]: 0xF4B30B,
    [BallColor.YELLOW]: 0xF4B30B
};

function deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };
    for (const key in source) {
        if (source[key] !== undefined) {
            const targetVal = (target as Record<string, unknown>)[key];
            const sourceVal = source[key];
            if (sourceVal !== null && typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
                targetVal !== null && typeof targetVal === 'object' && !Array.isArray(targetVal)) {
                (result as Record<string, unknown>)[key] = deepMerge(targetVal as object, sourceVal as object);
            } else {
                (result as Record<string, unknown>)[key] = sourceVal;
            }
        }
    }
    return result;
}

const defaultConfig = {
    LIQUID_BALL_DISPLAY_WIDTH_RATIO: 1.2,
    LIQUID_BALL_SIZE_SCALE: 1.5,
    BALL_EXPRESSION_OFFSET_X: 0,
    BALL_EXPRESSION_OFFSET_Y: 0,
    BALL_EXPRESSION_SCALE_RATIO: 0.8,
    BALL_EXPRESSION_FRAME_RATE: 25,
    SPLASH_TUBE_WIDTH_RATIO: 1.1,
    SPLASH_VERTICAL_OFFSET_RATIO: 0.2,
    SPLASH_FRAME_RATE: 30,
    LIQUID_UP_FRAME_RATE: 30,
    BALL_RISE_DURATION: 100,
    BALL_DROP_DURATION: 60,
    BALL_MOVE_RISE_ALREADY_HOVER: 1,
    BALL_MOVE_RISE_NORMAL: 100,
    BALL_MOVE_ARC_TIME: 60,
    BALL_MOVE_START_DELAY: 50,
    WATER_RISE_DURATION: 50,
    GAME_CONFIG: {
        TUBE_CAPACITY: 8,
        BALL_SPACING: 2,
        BALL_SIZE: 82,
        TUBE_COUNT: 14,
        TUBE_ROWS: 2,
        TUBE_COLS: 7,
        CANDLE_SCALE_FACTOR: 1.12,
        PORTRAIT: {
            WIDTH: 1080,
            HEIGHT: 2160,
            TUBE_WIDTH: 91,
            TUBE_HEIGHT: 713,
            TUBE_START_Y: 290,
            TUBE_SPACING_X: 49,
            ROW_SPACING_Y: 812,
            FIRST_TUBE_X: 75,
            FIRST_TUBE_Y: 295,
            COL_OFFSET_X: 140,
            BALL_OFFSET_X: 25,
            BALL_OFFSET_Y: 4
        },
        LANDSCAPE: {
            WIDTH: 2160,
            HEIGHT: 1080,
            TUBE_WIDTH: 54,
            TUBE_HEIGHT: 432,
            TUBE_START_Y: 50,
            TUBE_SPACING_X: 35,
            ROW_SPACING_Y: 500,
            FIRST_TUBE_X: 838,
            FIRST_TUBE_Y: 121,
            COL_OFFSET_X: 100,
            BALL_OFFSET_X: 13,
            BALL_OFFSET_Y: 2
        }
    },
    UI_CONFIG: {
        ICON: {
            PORTRAIT: { x: 20, y: 20 },
            LANDSCAPE: { x: 20, y: 20 }
        },
        DOWNLOAD_BTN: {
            PORTRAIT: { x: 540, y: 1960 },
            LANDSCAPE: { x: 1920, y: 953 }
        },
        POPUP: {
            ICON_OFFSET_Y: -80,
            DOWNLOAD_BTN_OFFSET_Y: 50
        },
        LEVEL_SELECT: {
            PREVIEW_SIZE_RATIO_PORTRAIT: 0.15,
            PREVIEW_SIZE_RATIO_LANDSCAPE: 0.15
        }
    }
};

const cfg = deepMerge(defaultConfig, configJson as typeof defaultConfig);

/** 液体球帧动画的 displayWidth 相对试管 displayWidth 的比例，便于调试 */
export const LIQUID_BALL_DISPLAY_WIDTH_RATIO = cfg.LIQUID_BALL_DISPLAY_WIDTH_RATIO;

/** 水球整体尺寸倍数，可调小水球：1.0 为默认，<1 缩小（如 0.8、0.9） */
export const LIQUID_BALL_SIZE_SCALE = cfg.LIQUID_BALL_SIZE_SCALE;

/** 圆球表情在小球上的位置偏移（相对小球中心），可调整：X 正值向右，Y 正值向下 */
export const BALL_EXPRESSION_OFFSET_X = cfg.BALL_EXPRESSION_OFFSET_X;
export const BALL_EXPRESSION_OFFSET_Y = cfg.BALL_EXPRESSION_OFFSET_Y;

/** 圆球表情在小球上的尺寸倍数，1.0 为默认，可调整：>1 放大，<1 缩小 */
export const BALL_EXPRESSION_SCALE_RATIO = cfg.BALL_EXPRESSION_SCALE_RATIO;

/** 圆球表情动画帧率，越大播放越快（默认 12） */
export const BALL_EXPRESSION_FRAME_RATE = cfg.BALL_EXPRESSION_FRAME_RATE;

/** 水花 displayWidth 相对试管宽度的比例，便于调试 */
export const SPLASH_TUBE_WIDTH_RATIO = cfg.SPLASH_TUBE_WIDTH_RATIO;

/** 水花位置垂直偏移补正：为水花高度的比例，正值向下（暂定 0.2 = 20%） */
export const SPLASH_VERTICAL_OFFSET_RATIO = cfg.SPLASH_VERTICAL_OFFSET_RATIO;

/** 水花动画播放帧率，越大越快（默认 30） */
export const SPLASH_FRAME_RATE = cfg.SPLASH_FRAME_RATE;

/** 液体上升动画播放帧率，越大越快（默认 30） */
export const LIQUID_UP_FRAME_RATE = cfg.LIQUID_UP_FRAME_RATE;

/** 小球选中飞起动画时长（ms），越小越快 */
export const BALL_RISE_DURATION = cfg.BALL_RISE_DURATION;

/** 小球落回试管动画时长（ms），越小越快 */
export const BALL_DROP_DURATION = cfg.BALL_DROP_DURATION;

/** 小球跨试管移动：已悬浮顶球快速调整时长（ms），越小越快 */
export const BALL_MOVE_RISE_ALREADY_HOVER = cfg.BALL_MOVE_RISE_ALREADY_HOVER;
/** 小球跨试管移动：从试管内上升到试管口上方的时长（ms），越小越快 */
export const BALL_MOVE_RISE_NORMAL = cfg.BALL_MOVE_RISE_NORMAL;

/** 小球跨试管移动：弧线飞行时长（ms），越小越快 */
export const BALL_MOVE_ARC_TIME = cfg.BALL_MOVE_ARC_TIME;

/** 小球跨试管移动：每颗球启动的间隔（ms），用于多球联动 */
export const BALL_MOVE_START_DELAY = cfg.BALL_MOVE_START_DELAY;

/** 试管内液体水平面上升动画时长（ms），球落定后水位渐升 */
export const WATER_RISE_DURATION = cfg.WATER_RISE_DURATION;

export const GAME_CONFIG = cfg.GAME_CONFIG;
export const UI_CONFIG = cfg.UI_CONFIG;
