import { Scene } from 'phaser';


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
