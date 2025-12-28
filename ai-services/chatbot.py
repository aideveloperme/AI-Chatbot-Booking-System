# ai-service/chatbot.py
# Chatbot logic with LangChain integration

import json
from typing import List, Dict, Optional
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from prompts import SYSTEM_PROMPT

class ConversationManager:
    """Manages chatbot conversations and LLM interactions"""
    
    def __init__(self, api_key: str, model: str = "gpt-3.5-turbo"):
        self.llm = ChatOpenAI(
            model=model,
            openai_api_key=api_key,
            temperature=0.7,
            max_tokens=2000
        )
    
    def build_messages(self, user_message: str, history: List[Dict]) -> List:
        """Convert conversation history to LangChain message format"""
        messages = [SystemMessage(content=SYSTEM_PROMPT)]
        
        # Add conversation history
        for msg in history:
            if msg['role'] == 'user':
                messages.append(HumanMessage(content=msg['content']))
            elif msg['role'] == 'assistant':
                messages.append(AIMessage(content=msg['content']))
        
        # Add current user message
        messages.append(HumanMessage(content=user_message))
        
        return messages
    
    def process_message(self, user_message: str, history: List[Dict]) -> str:
        """Process user message and generate AI response"""
        messages = self.build_messages(user_message, history)
        
        try:
            response = self.llm.invoke(messages)
            return response.content
        except Exception as e:
            print(f"LLM Error: {e}")
            raise Exception(f"Failed to generate response: {str(e)}")
    
    def extract_appointment_intent(self, response: str) -> Optional[Dict]:
        """Extract appointment booking intent from AI response"""
        try:
            if "{" in response and "}" in response:
                start_idx = response.index("{")
                end_idx = response.rindex("}") + 1
                json_str = response[start_idx:end_idx]
                
                data = json.loads(json_str)
                
                if data.get("action") == "create_appointment":
                    return {
                        "serviceType": data.get("serviceType"),
                        "date": data.get("date"),
                        "time": data.get("time"),
                        "notes": data.get("notes", "")
                    }
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Failed to parse appointment intent: {e}")
        
        return None
    
    def clean_response(self, response: str) -> str:
        """Remove JSON from response text"""
        if "{" in response:
            return response[:response.index("{")].strip()
        return response