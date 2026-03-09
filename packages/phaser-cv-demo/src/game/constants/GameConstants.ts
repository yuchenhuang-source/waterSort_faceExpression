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

export type DefaultConfigType = typeof defaultConfig;

const defaultConfig = {
    LIQUID_BALL_DISPLAY_WIDTH_RATIO: 1.2,
    LIQUID_BALL_SIZE_SCALE: 1.5,
    LIQUID_HEIGHT_SCALE: 1,
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
            TUBES_SCALE: 1,
            TUBE_WIDTH: 91,
            TUBE_HEIGHT: 713,
            TUBE_START_Y: 290,
            TUBE_SPACING_X: 49,
            ROW_SPACING_Y: 812,
            TUBES_CENTER_X: 540,
            TUBES_CENTER_Y: 696,
            COL_OFFSET_X: 140,
            BALL_OFFSET_X: 25,
            BALL_OFFSET_Y: 4
        },
        LANDSCAPE: {
            WIDTH: 2160,
            HEIGHT: 1080,
            TUBES_SCALE: 1,
            TUBE_WIDTH: 54,
            TUBE_HEIGHT: 432,
            TUBE_COLS: 14,
            TUBE_ROWS: 1,
            TUBE_START_Y: 50,
            TUBE_SPACING_X: 35,
            ROW_SPACING_Y: 500,
            TUBES_CENTER_X: 1080,
            TUBES_CENTER_Y: 300,
            COL_OFFSET_X: 100,
            BALL_OFFSET_X: 13,
            BALL_OFFSET_Y: 2
        }
    },
    UI_CONFIG: {
        ICON: {
            PORTRAIT: { x: 0.02, y: 0.01, displayWidth: 128, displayHeight: 128 },
            LANDSCAPE: { x: 0.02, y: 0.02, displayWidth: 128, displayHeight: 128 }
        },
        DOWNLOAD_BTN: {
            PORTRAIT: { x: 0, y: 0.82, scale: 1 },
            LANDSCAPE: { x: 0, y: 0.76, scale: 1 }
        },
        POPUP: {
            ICON_OFFSET_Y: -80,
            DOWNLOAD_BTN_OFFSET_Y: 50
        },
        HAND_GUIDE: {
            tapDuration: 300,
            tapRepeatDelay: 200,
            moveDuration: 300,
            fadeDuration: 200
        },
        HAND_ANIMATION: {
            moveDuration: 600,
            waitAfterMove: 400,
            tapDuration: 500,
            idleDuration: 500,
            handTapDuration: 0.32,
            handMoveTransition: 0.9,
            offsetX: 0.82,
            offsetY: 0.78
        },
        LEVEL_SELECT: {
            LOGO_SCALE: 1.08,
            LOGO_OFFSET_X: 0,
            LOGO_OFFSET_Y: 0,
            PREVIEW_WIDTH_RATIO_PORTRAIT: 0.15,
            PREVIEW_WIDTH_RATIO_LANDSCAPE: 0.15,
            PREVIEW_HEIGHT_PORTRAIT: 180,
            PREVIEW_HEIGHT_LANDSCAPE: 120,
            PREVIEW_BORDER_WIDTH: 2,
            PREVIEW_BORDER_COLOR: '#ffffff',
            PREVIEW_BORDER_RADIUS: 8,
            PREVIEW_OFFSET_X: 0,
            PREVIEW_OFFSET_Y: 38,
            PREVIEW_SCALE: 0.95,
            PREVIEW_LIQUID_HEIGHT_RATIO: 0.85
        }
    }
};

let _cfg = deepMerge(defaultConfig, {} as Partial<DefaultConfigType>);

/** 运行时初始化配置，bootstrap 时调用 */
export function initGameConstants(config: Partial<DefaultConfigType>): void {
    _cfg = deepMerge(defaultConfig, config);
}

/** 运行时配置对象，所有配置项通过 getter 读取 */
export const Config = {
    get LIQUID_BALL_DISPLAY_WIDTH_RATIO() { return _cfg.LIQUID_BALL_DISPLAY_WIDTH_RATIO; },
    get LIQUID_BALL_SIZE_SCALE() { return _cfg.LIQUID_BALL_SIZE_SCALE; },
    get LIQUID_HEIGHT_SCALE() { return _cfg.LIQUID_HEIGHT_SCALE; },
    get BALL_EXPRESSION_OFFSET_X() { return _cfg.BALL_EXPRESSION_OFFSET_X; },
    get BALL_EXPRESSION_OFFSET_Y() { return _cfg.BALL_EXPRESSION_OFFSET_Y; },
    get BALL_EXPRESSION_SCALE_RATIO() { return _cfg.BALL_EXPRESSION_SCALE_RATIO; },
    get BALL_EXPRESSION_FRAME_RATE() { return _cfg.BALL_EXPRESSION_FRAME_RATE; },
    get SPLASH_TUBE_WIDTH_RATIO() { return _cfg.SPLASH_TUBE_WIDTH_RATIO; },
    get SPLASH_VERTICAL_OFFSET_RATIO() { return _cfg.SPLASH_VERTICAL_OFFSET_RATIO; },
    get SPLASH_FRAME_RATE() { return _cfg.SPLASH_FRAME_RATE; },
    get LIQUID_UP_FRAME_RATE() { return _cfg.LIQUID_UP_FRAME_RATE; },
    get BALL_RISE_DURATION() { return _cfg.BALL_RISE_DURATION; },
    get BALL_DROP_DURATION() { return _cfg.BALL_DROP_DURATION; },
    get BALL_MOVE_RISE_ALREADY_HOVER() { return _cfg.BALL_MOVE_RISE_ALREADY_HOVER; },
    get BALL_MOVE_RISE_NORMAL() { return _cfg.BALL_MOVE_RISE_NORMAL; },
    get BALL_MOVE_ARC_TIME() { return _cfg.BALL_MOVE_ARC_TIME; },
    get BALL_MOVE_START_DELAY() { return _cfg.BALL_MOVE_START_DELAY; },
    get WATER_RISE_DURATION() { return _cfg.WATER_RISE_DURATION; },
    get GAME_CONFIG() { return _cfg.GAME_CONFIG; },
    get UI_CONFIG() { return _cfg.UI_CONFIG; },
};
