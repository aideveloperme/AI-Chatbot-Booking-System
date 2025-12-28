# ai-service/app.py
# Fixed for Windows, Python 3.13, OpenAI GPT
print("🚀 APP Starting...")

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import json
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor

# Updated imports for LangChain 0.3+ and Python 3.13 compatibility
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

import uvicorn
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AI Appointment Booking Service")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection
def get_db_connection():
    try:
        return psycopg2.connect(
            os.getenv("DATABASE_URL"),
            cursor_factory=RealDictCursor
        )
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        raise

# Initialize LLM with OpenAI
print("🤖 Initializing OpenAI GPT-3.5-turbo...")
try:
    llm = ChatOpenAI(
        model="gpt-3.5-turbo",
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        temperature=0.7,
        max_tokens=2000
    )
    print("✅ LLM initialized successfully")
except Exception as e:
    print(f"❌ LLM initialization failed: {e}")
    print("Make sure OPENAI_API_KEY is set in .env file")

# Request/Response models
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    conversationHistory: List[ChatMessage] = []
    userId: str

class ChatResponse(BaseModel):
    response: str
    appointmentCreated: bool = False
    appointmentDetails: Optional[Dict[str, Any]] = None

# System prompt for conversation orchestration
SYSTEM_PROMPT = """You are a helpful AI assistant for an appointment booking system. Your role is to help users schedule appointments through natural conversation.

Your responsibilities:
1. Greet users warmly and ask how you can help
2. Collect the following information for booking:
   - Service type (e.g., consultation, follow-up, meeting)
   - Preferred date
   - Preferred time
   - Any special notes or requirements

3. Business hours: Monday-Friday, 9:00 AM - 5:00 PM
4. Appointment slots are 30 minutes long
5. Only book appointments for future dates

Conversation guidelines:
- Be friendly, professional, and concise
- Ask for one piece of information at a time if details are missing
- Confirm all details before creating the appointment
- Handle ambiguity gracefully (e.g., "tomorrow" = next business day)
- If a time slot is unavailable, suggest alternatives
- Provide clear confirmation when appointment is created

When you have collected ALL required information and the user confirms, respond with a JSON object in this exact format:
{
  "action": "create_appointment",
  "serviceType": "the service type",
  "date": "YYYY-MM-DD",
  "time": "HH:MM:SS",
  "notes": "any additional notes"
}

Important: Only output this JSON when the user has confirmed all details. Otherwise, continue the conversation naturally to gather missing information or clarify details."""

# Conversation state manager
class ConversationManager:
    def __init__(self):
        self.llm = llm
    
    def build_conversation_history(self, history: List[ChatMessage]):
        """Convert conversation history to LangChain messages"""
        messages = [SystemMessage(content=SYSTEM_PROMPT)]
        
        for msg in history:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                messages.append(AIMessage(content=msg.content))
        
        return messages
    
    def parse_appointment_intent(self, response_text: str) -> Optional[Dict[str, Any]]:
        """Extract appointment details if present in response"""
        try:
            # Check if response contains JSON
            if "{" in response_text and "}" in response_text:
                start_idx = response_text.index("{")
                end_idx = response_text.rindex("}") + 1
                json_str = response_text[start_idx:end_idx]
                
                appointment_data = json.loads(json_str)
                
                if appointment_data.get("action") == "create_appointment":
                    print(f"✅ Appointment intent detected: {appointment_data}")
                    return {
                        "serviceType": appointment_data.get("serviceType"),
                        "date": appointment_data.get("date"),
                        "time": appointment_data.get("time"),
                        "notes": appointment_data.get("notes", "")
                    }
        except (json.JSONDecodeError, ValueError) as e:
            print(f"⚠️ Failed to parse appointment intent: {e}")
        
        return None
    
    def process_message(self, user_message: str, history: List[ChatMessage]) -> str:
        """Process user message with LLM"""
        messages = self.build_conversation_history(history)
        messages.append(HumanMessage(content=user_message))
        
        try:
            print(f"💬 Processing message: {user_message[:50]}...")
            # Updated invoke method for newer LangChain
            response = self.llm.invoke(messages)
            print(f"✅ Response generated")
            return response.content
        except Exception as e:
            print(f"❌ LLM error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to generate response: {str(e)}")

# Appointment service
class AppointmentService:
    @staticmethod
    def check_availability(date: str, time: str) -> bool:
        """Check if appointment slot is available"""
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            
            cur.execute(
                "SELECT check_appointment_availability(%s, %s, %s) as available",
                (date, time, 30)
            )
            
            result = cur.fetchone()
            cur.close()
            conn.close()
            
            available = result['available'] if result else False
            print(f"📅 Availability check for {date} {time}: {available}")
            return available
        except Exception as e:
            print(f"❌ Availability check error: {e}")
            return False
    
    @staticmethod
    def create_appointment(user_id: str, service_type: str, date: str, time: str, notes: str = "") -> Dict[str, Any]:
        """Create appointment in database"""
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            
            # Check availability first
            if not AppointmentService.check_availability(date, time):
                raise HTTPException(status_code=409, detail="Time slot not available")
            
            cur.execute(
                """INSERT INTO appointments 
                   (user_id, service_type, appointment_date, appointment_time, notes, status) 
                   VALUES (%s, %s, %s, %s, %s, %s) 
                   RETURNING *""",
                (user_id, service_type, date, time, notes, 'scheduled')
            )
            
            appointment = cur.fetchone()
            conn.commit()
            
            print(f"✅ Appointment created: {appointment['id']}")
            
            # Log to chat session
            AppointmentService.log_chat_interaction(user_id, "appointment_created", dict(appointment))
            
            cur.close()
            conn.close()
            
            return dict(appointment)
        except HTTPException:
            raise
        except Exception as e:
            print(f"❌ Appointment creation error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to create appointment: {str(e)}")
    
    @staticmethod
    def log_chat_interaction(user_id: str, interaction_type: str, metadata: Dict = None):
        """Log chat interaction for analytics"""
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            
            # Create chat session
            cur.execute(
                """INSERT INTO chat_sessions (user_id, message_count)
                   VALUES (%s, 1)
                   RETURNING id""",
                (user_id,)
            )
            
            conn.commit()
            cur.close()
            conn.close()
            print(f"✅ Chat interaction logged")
        except Exception as e:
            print(f"⚠️ Logging error: {e}")

# Initialize conversation manager
conversation_manager = ConversationManager()

# API Routes
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "ai-appointment-booking",
        "timestamp": datetime.now().isoformat(),
        "llm_model": "gpt-3.5-turbo"
    }

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Main chat endpoint"""
    try:
        print(f"\n{'='*60}")
        print(f"📨 New chat request from user: {request.userId}")
        print(f"💬 Message: {request.message}")
        
        # Process message with LLM
        response_text = conversation_manager.process_message(
            request.message,
            request.conversationHistory
        )
        
        # Check if response contains appointment creation intent
        appointment_data = conversation_manager.parse_appointment_intent(response_text)
        
        if appointment_data:
            # Create appointment
            try:
                appointment = AppointmentService.create_appointment(
                    user_id=request.userId,
                    service_type=appointment_data["serviceType"],
                    date=appointment_data["date"],
                    time=appointment_data["time"],
                    notes=appointment_data["notes"]
                )
                
                # Clean response text (remove JSON)
                clean_response = response_text
                if "{" in clean_response:
                    clean_response = clean_response[:clean_response.index("{")].strip()
                
                if not clean_response:
                    clean_response = f"Perfect! I've scheduled your {appointment_data['serviceType']} appointment for {appointment_data['date']} at {appointment_data['time']}. You'll receive a confirmation shortly."
                
                print(f"✅ Appointment created successfully")
                return ChatResponse(
                    response=clean_response,
                    appointmentCreated=True,
                    appointmentDetails=appointment
                )
            except HTTPException as e:
                # If appointment creation fails, inform user
                print(f"⚠️ Appointment creation failed: {e.detail}")
                return ChatResponse(
                    response="I apologize, but that time slot is no longer available. Would you like to try a different time?",
                    appointmentCreated=False
                )
        
        # Regular conversation response
        print(f"✅ Regular chat response sent")
        return ChatResponse(
            response=response_text,
            appointmentCreated=False
        )
        
    except Exception as e:
        print(f"❌ Chat processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process chat message: {str(e)}")

@app.get("/appointments/availability")
async def check_availability(date: str, time: str):
    """Check appointment availability"""
    try:
        available = AppointmentService.check_availability(date, time)
        return {"available": available, "date": date, "time": time}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to check availability")

# Startup event
@app.on_event("startup")
async def startup_event():
    print("\n" + "="*60)
    print("🚀 AI Appointment Booking Service Starting...")
    print(f"📍 Running on: http://localhost:{os.getenv('PORT', 5000)}")
    print(f"🤖 LLM Model: gpt-3.5-turbo")
    print(f"💻 OS: Windows")
    print(f"🐍 Python: 3.13")
    print("="*60 + "\n")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )