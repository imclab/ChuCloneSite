/**
File:
	ServerApp.js
Created By:
	Mario Gonzalez
Project:
	NoBarrierOSC
Abstract:
	This class represents the server side application for NoBarrierOSC's joystick implementation

Basic Usage:
 	var serverApp = new JoystickDemo.ServerApp();
    serverApp.startGameClock();
Version:
	1.0
*/
(function(){
	JoystickDemo.ServerApp = function() {
		this.setupCmdMap();
	};

	JoystickDemo.ServerApp.prototype = {
        gameClockReal  			: 0,											// Actual time via "new Date().getTime();"
		gameClock				: 0,											// Seconds since start
		gameTick				: 0,											// Ticks/frames since start

		targetFramerate			: 60,											// Try to call our tick function this often, intervalFramerate, is used to determin how often to call settimeout - we can set to lower numbers for slower computers
		intervalGameTick		: null,											// setInterval reference

        /**
         * @type {RealtimeMultiplayerGame.network.ServerNetChannel}
         */
		netChannel				: null,
		cmdMap					: {},					// Map the CMD constants to functions
		nextEntityID			: 0,					// Incremented for everytime a new object is created

        /**
         * @type {JoystickDemo.JoystickGameEntity}
         */
        joystick                : null,

        /**
         * @type {JoystickDemo.JoystickGameEntity}
         */
        cabinet                : null,

		startGameClock: function() {
			this.entityController = new RealtimeMultiplayerGame.Controller.EntityController();
			this.setupNetChannel();

            var that = this;
			this.intervalGameTick = setInterval( function(){ that.update() }, Math.floor( 1000/this.targetFramerate ));
		},

		// Methods
		setupNetChannel: function() {
			this.netChannel = new RealtimeMultiplayerGame.network.ServerNetChannel( this );
		},

		/**
		 * Map RealtimeMultiplayerGame.Constants.CMDS to functions
		 * If ServerNetChannel does not contain a function, it will check to see if it is a special function which the delegate wants to catch
		 * If it is set, it will call that CMD on its delegate
		 */
		setupCmdMap: function() {
            this.cmdMap = {};
			//this.cmdMap[RealtimeMultiplayerGame.Constants.CMDS.PLAYER_UPDATE] = this.shouldUpdatePlayer;
            this.cmdMap[RealtimeMultiplayerGame.Constants.CMDS.JOYSTICK_UPDATE] = this.joystickUpdate;
            this.cmdMap[RealtimeMultiplayerGame.Constants.CMDS.JOYSTICK_SELECT_LEVEL] = this.joystickSelectLevel;
            this.cmdMap[RealtimeMultiplayerGame.Constants.CMDS.LEVEL_COMPLETE] = this.onLevelComplete;
		},


		/**
		 * Updates the gameworld
		 * Creates a WorldEntityDescription which it sends to NetChannel
		 */
		update: function() {
			this.updateClock();
			// Create a new world-entity-description,
			var worldEntityDescription = new JoystickDemo.WorldEntityDescription( this, new SortedLookupTable() );
			this.netChannel.tick( this.gameClock, worldEntityDescription );


            if (!this.cabinet || !this.joystick ) {
                //console.log("Joystick: " + (this.joystick != null) + " | Cabinet: " + (this.cabinet != null))
            }

		},



        /**
         * Drops any existing cabinets
         */
        setCabinet: function( anEntity ) {
            console.log("setting cabinet")

            if( this.cabinet ) {
                var client = this.netChannel.getClientWithID( anEntity.getClientID() );
                this.netChannel.closeConnection( client.getConnection() );
            }

            this.cabinet = anEntity;
            return this.cabinet;
        },

        /**
         * Drops any existing joysticks
         */
        setJoystick: function( anEntity ) {
            if( this.joystick ) {
                var client = this.netChannel.getClientWithID( anEntity.getClientID() );
                this.netChannel.closeConnection( client.getConnection() );
            }

            this.joystick = anEntity;
            return this.joystick;
        },

        /**
         * Called continuously by a connected joystick - contains information about the state of the joystick
         * @param {RealtimeMultiplayerGame.network.Client} client
         * @param {Object} data
         */
		shouldUpdatePlayer: function( client, data ) {
			var player = this.entityController.getPlayerWithid( client.clientid );
			if(!player) {
				console.log("ServerApp::shouldUpdatePlayer - Player not found (clientid = "+client.clientid+")");
				return;
			}
            player.parseJoystickData( data.payload );
		},

        /**
         * Called continuously by a connected joystick - contains information about the state of the joystick
         * @param {RealtimeMultiplayerGame.network.Client} client
         * @param {Object} data
         */
		joystickSelectLevel: function( client, data ) {
            console.log("ChangeLevel!", data.payload)
            if( this.cabinet ) {
                var cabinetConnection = this.netChannel.getClientWithID( this.cabinet.clientid );
                cabinetConnection.sendMessage( data, this.getGameClock() );
            }
		},

        /**
         * Called continuously by a connected joystick - contains information about the state of the joystick
         * @param {RealtimeMultiplayerGame.network.Client} client
         * @param {Object} data
         */
		onLevelComplete: function( client, data ) {
            console.log("LEVEL COMPLETE!!!!!!", data.payload)
            if( this.joystick ) {
                var joystickConnection = this.netChannel.getClientWithID( this.joystick.clientid );
                joystickConnection.sendMessage( data, this.getGameClock() );
            }
		},


        /**
         * Pass joystick data off to the client
         * @param client
         * @param data
         */
         joystickUpdate_counter: 0,
        joystickUpdate: function( client, data) {
        
        	if(++this.joystickUpdate_counter % 10 == 0)
	            console.log("Analog: " +data.payload.analog + " Button: " + data.payload.button + " Level:" + data.payload.level);

            try {
                if (this.cabinet) {
                    //console.log("Sending msg to cabinet")
                    var cabinetConnection = this.netChannel.getClientWithID(this.cabinet.clientid);
                    cabinetConnection.sendMessage(data, this.getGameClock());
                }
            } catch(e) {
                this.cabinet = null;
            }
        },

        /**
        * Called after a connection has been established.
        * Return true to allow the client to connect, or false to prevent the client from joining
        * @param {String} aClientid
        * @param {Object} data
        */
       shouldAddPlayer: function( aClientid, data ) {
           console.log("ServerApp::shouldAddPlayer - Adding entity, entityCount: " + this.entityController.getEntities().count() );
           var entity = null;

           // Try to add joystick - 1 active per game
           if( data.payload.type === "joystick" ) {
               if( this.joystick ) {
                   console.log("Setting Joystick...denied");
                   return false;
               } else {
                   console.log("Setting Joystick...approved");
                   entity = this.joystick = new JoystickDemo.JoystickGameEntity( this.getNextEntityID(), aClientid );
               }
           }

           // Try to add cabinate - 1 per game
           if( data.payload.type === "cabinet" ) {
               entity = this.setCabinet(  new JoystickDemo.JoystickGameEntity( this.getNextEntityID(), aClientid ) )
           }

           entity.entityType = data.payload.type;
           this.entityController.addPlayer( entity );

           return true;
       },


        /**
         * Called when a connected client has disconnected
         * @param {String} clientid Id of the disconnected client
         */
		shouldRemovePlayer: function( clientid ) {
            var entity = this.entityController.getPlayerWithid( clientid );
            if(!entity) {
                console.log('clientid:', clientid)
                console.log("all", this.entityController.entities)
            }
            console.log("Drop player - ", entity );
            
            if( entity ) {
                if(entity == this.joystick) this.joystick = null;
                else if( entity == this.cabinet) this.cabinet = null;
                this.entityController.removePlayer( clientid );
            }
		},


        /**
		 * Updates the gameclock and sets the current
		 */
		updateClock: function() {
			// Store previous time and update current
			var oldTime = this.gameClockReal;
			this.gameClockReal = new Date().getTime();

			// Our clock is zero based, so if for example it says 10,000 - that means the game started 10 seconds ago
			var delta = this.gameClockReal - oldTime;
			this.gameClock += delta;
			this.gameTick++;

			// Framerate Independent Motion -
			// 1.0 means running at exactly the correct speed, 0.5 means half-framerate. (otherwise faster machines which can update themselves more accurately will have an advantage)
			this.speedFactor = delta / ( 1000/this.targetFramerate );
			if (this.speedFactor <= 0) this.speedFactor = 1;
		},

	   	log: function() { console.log.apply(console, arguments); },

		///// Accessors
		getNextEntityID: function() { return ++this.nextEntityID; },
		getGameClock: function() { return this.gameClock; },
		getGameTick: function() { return this.gameTick; }
	};
})();