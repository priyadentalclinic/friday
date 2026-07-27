package com.friday.ai.models

data class Mission(
    val id: String = java.util.UUID.randomUUID().toString(),
    val query: String,
    val isVoice: Boolean = false,
    var status: MissionStatus = MissionStatus.ANALYZING,
    var replyText: String? = null,
    var action: MissionAction? = null
)

enum class MissionStatus {
    ANALYZING, EXECUTING, COMPLETED, FAILED
}

data class MissionAction(
    val type: String,
    val target: String? = null,
    val payload: Map<String, Any>? = null
)
