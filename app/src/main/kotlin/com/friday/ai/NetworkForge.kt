package com.friday.ai

import android.content.Context
import android.net.ConnectivityManager
import android.util.Log
import kotlinx.coroutines.*
import java.net.*

class NetworkForge(private val context: Context) {
    
    suspend fun auditNetwork(): List<String> = withContext(Dispatchers.IO) {
        val discoveredNodes = mutableListOf<String>()
        val subnet = getSubnet() ?: return@withContext emptyList()
        
        Log.d("FRIDAY", "Starting Forge audit on subnet $subnet")
        
        // Parallel TCP Sweep (Ports 80, 443, 22)
        val jobs = (1..254).map { i ->
            launch {
                val ip = "$subnet.$i"
                if (isHostReachable(ip, 80) || isHostReachable(ip, 443) || isHostReachable(ip, 22)) {
                    synchronized(discoveredNodes) {
                        discoveredNodes.add(ip)
                    }
                }
            }
        }
        jobs.joinAll()
        
        discoveredNodes
    }

    private fun isHostReachable(ip: String, port: Int): Boolean {
        return try {
            val socket = Socket()
            socket.connect(InetSocketAddress(ip, port), 200) // 200ms timeout
            socket.close()
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun getSubnet(): String? {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val linkProps = cm.getLinkProperties(cm.activeNetwork)
        val ip = linkProps?.linkAddresses?.firstOrNull { it.address is Inet4Address }?.address?.hostAddress
        return ip?.substringBeforeLast(".")
    }
}
