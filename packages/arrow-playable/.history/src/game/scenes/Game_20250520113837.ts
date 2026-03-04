import { EventBus } from '../EventBus';
import { Scene } from 'phaser';
import Block from '../block';


export class Game extends Scene
{
    constructor ()
    {
        super('Game');
    }

    create ()
    {
        this.scale.setGameSize(1080, 2160);
    }

   onResize () {

   }
}
