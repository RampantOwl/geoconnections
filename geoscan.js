var raw       = require( 'raw-socket' )
var timers    = require( 'timers' )
var freegeoip = require( 'node-freegeoip' )
var dns       = require( 'dns')
var Table     = require( 'cli-table');
var argv      = require( 'optimist').argv
var console   = require( 'better-console')
var socket    = raw.createSocket( { protocol : raw.Protocol.TCP } )

var active_connections = {}
var all_connections    = {}
var type = "active"

var stdin = process.stdin;

Array.prototype.sortByProp = function(p){
 return this.sort(function(a,b){
  return (a[p] > b[p]) ? 1 : (a[p] < b[p]) ? -1 : 0;
 });
}


/*
 *  Represents a connection
 */
function Connection( addr) {
    this.dns_name  = 'unresolved'
    this.source    = addr
    this.country_name = 'Unresolved'
    this.protocol  = 'TCP'
    this.discovered  = new Date()
    this.last_heard = new Date()
    this.lost = false
    this.bytecount = 0
    this.last_bytecount = 0
}
Connection.prototype.getDuration = function(){
    return this.discovered.getTime() + this.last_heard.getTime()
}
Connection.prototype.addToByteCount = function( bytecount ) {
    this.bytecount += bytecount
    this.last_bytecount = bytecount
    
}
Connection.prototype.getConnectionTime = function(){
    return (this.last_heard )
}
Connection.prototype.dnsReverse = function(){
    var connection = this
    dns.reverse(connection.source,function( err, addresses){
	if( !err && addresses)
	    connection.dns_name = addresses
	else
	    connection.dns_name = "Resolve Error"
    })
},
Connection.prototype.geoLookup = function (){
    var connection = this
    freegeoip.getLocation(connection.source , function( err , location){
	if (!err )
	    connection.country_name = location.country_name
    })
}

/* Main Thread Entry */
console.log( '\u001B[2J\u001B[0;0f' )
console.log("Started listening ..please wait")

/* Start listening for events */
stdin.setRawMode(true)
stdin.resume()
stdin.setEncoding( 'utf8' );
stdin.on('data', function (key) {
    switch(key){
    case '\u0003': /* Ctrl-C */
	process.exit()
	break;
	
    case "a":
	type = "active"
	break
	
    case "h":
	type = "historic"
	break;
	
    }
    
});
 


/* Setup listening for socket on,message,and close*/
/* Adds incomming Connection objects to active_connections and all_connections */
/* active_connections are pruned when connections are dropped */
socket.on( "on" , function( buffer , addr ) {    

    active_connections[addr] = new Connection( addr )
    active_connections[addr].dnsReverse()
    active_connections[addr].geoLookup()
    active_connections[addr].addToByteCount( buffer.length )
    
    all_connections[addr] = active_connections[addr]
    
})
socket.on( "message" , function( buffer , addr ) {
    if ( !active_connections[addr] ){
	active_connections[addr] = new Connection( addr )
	active_connections[addr].dnsReverse()
	active_connections[addr].geoLookup()
    }
    active_connections[addr].addToByteCount( buffer.length )
    active_connections[addr].last_seen = new Date()
    
    all_connections[addr] = active_connections[addr]
})

socket.on( "close" , function( buffer , addr ) {
    console.log("LOST")
    if (!active_connections[addr])
	return
    
    active_connections[addr].lost = new Date();
    /* Save to DB here */

    delete(active_connections[addr])
})

/* Start output to console interval */
timers.setInterval(function(){
    var connection_hash = {}
    
    if (type == "active")
	connection_hash = active_connections
    if (type == "historic")
	connection_hash = all_connections
		   
    
    var connection_keys = Object.keys(connection_hash)
    var connection_count = connection_keys.length
    
    console.log( '\u001B[2J\u001B[0;0f' )
    console.log( "Connections: " + connection_count )
    console.log( "List Mode : " + type )
    var table_data = []
    for ( var i=0; connection_keys.length > i; i++){
	connection = connection_hash[connection_keys[i]]
	table_data.push( {"IP" : connection.source,
			  "Country" : connection.country_name,
			  "Reverse DNS" : connection.dns_name,
			  "Total # bytes rcvc" : connection.bytecount,
			  "Last  # bytes rcvd" : connection.last_bytecount,
			  "Duration (ms)" : connection.getDuration(),
			  "Last Seen" : connection.last_seen.getTime()
		       })
    }
    table_data.sortByProp('last_seen')
    active_connections = {}
    console.table( table_data )
    
},2000 )
