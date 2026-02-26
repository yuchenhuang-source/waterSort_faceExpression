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

/** 液体颜色默认色值（可被 output-config.json 的 liquidColors 覆盖） */
export const DEFAULT_LIQUID_COLORS: { [key in BallColor]: number } = {
    [BallColor.BROWN]: 0x8B5A2B,
    [BallColor.ORANGE]: 0xFFA500,
    [BallColor.LIGHT_PURPLE]: 0xC8A2FF,
    [BallColor.GRAY]: 0xB4B4B4,
    [BallColor.PINK]: 0xFFB6C1,
    [BallColor.PURPLE]: 0x9333EA,
    [BallColor.RED]: 0xFF5050,
    [BallColor.GREEN]: 0x32CD32,
    [BallColor.FLUORESCENT_GREEN]: 0x00FF7F,
    [BallColor.BLUE]: 0x6495ED,
    [BallColor.CYAN]: 0x00FFFF,
    [BallColor.YELLOW]: 0xFFFF00
};

/** 液体球帧动画的 displayWidth 相对试管 displayWidth 的比例，便于调试 */
export const LIQUID_BALL_DISPLAY_WIDTH_RATIO = 1.2;

/** 水花 displayWidth 相对试管宽度的比例，便于调试 */
export const SPLASH_TUBE_WIDTH_RATIO = 1.1;

/** 水花位置垂直偏移补正：为水花高度的比例，正值向下（暂定 0.2 = 20%） */
export const SPLASH_VERTICAL_OFFSET_RATIO = 0.2;

export const GAME_CONFIG = {
    TUBE_CAPACITY: 8,
    BALL_SPACING: 2,
    BALL_SIZE: 82,
    TUBE_COUNT: 14,
    TUBE_ROWS: 2,
    TUBE_COLS: 7,
    CANDLE_SCALE_FACTOR: 1.12, // 蜡烛额外缩放系数
    
    // 竖屏布局
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
    
    // 横屏布局
    LANDSCAPE: {
        WIDTH: 2160,
        HEIGHT: 1080,
        TUBE_WIDTH: 54, // 调整试管宽度
        TUBE_HEIGHT: 432, // 调整试管高度，约占屏幕高度的40% (两行约80%)
        TUBE_START_Y: 50,
        TUBE_SPACING_X: 35,
        ROW_SPACING_Y: 500, // 调整行间距
        FIRST_TUBE_X: 838,
        FIRST_TUBE_Y: 121,
        COL_OFFSET_X: 100, // 增加列间距
        BALL_OFFSET_X: 13,
        BALL_OFFSET_Y: 2
    }
};