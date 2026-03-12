import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
// 导入自动资源加载API
import { loadAllAssets } from 'virtual:game-assets';

/**
 * 预加载场景
 * 负责加载游戏资源并初始化游戏
 */
export class Preloader extends Scene {
    constructor() {
        super('Preloader');
    }

    init() {
        this.cameras.main.setBackgroundColor('rgba(0, 0, 0, 0)');
    }

    /**
     * 预加载所有游戏资源
     */
    preload() {
        // 使用自动资源加载API加载所有资源
        // 这会自动加载src/assets目录下的所有支持的资源文件
        loadAllAssets(this);
        
        // 如果需要单独加载某个资源，也可以这样做：
        // const logoUrl = getAsset('logo');
        // if (logoUrl) this.load.image('logo', logoUrl);
    }

    /**
     * 加载网络字体
     */
    loadFont(name: string, url: string) {
        var newFont = new FontFace(name, `url(${url})`);
        newFont.load().then(function (loaded) {
            document.fonts.add(loaded);
        }).catch(function (error) {
            console.error('Error loading font:', error);
            return error;
        });
    }

    /**
     * 资源加载完成后创建游戏场景
     */
    create() {
        // 通知游戏准备就绪
        console.log('资源加载完成，游戏准备就绪');
        
        // 检查 URL 参数 editor=1
        const urlParams = new URLSearchParams(window.location.search);
        const isEditorMode = urlParams.get('editor') === '1';
        
        if (isEditorMode) {
            // 启动编辑器场景
            this.scene.start('Editor');
        } else {
            // 启动主游戏场景
            this.scene.start('Game');
        }
        
        // 通知React组件预加载已完成
        EventBus.emit('preloading-complete');
    }
}
