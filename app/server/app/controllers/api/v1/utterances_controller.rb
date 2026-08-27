module Api
  module V1
    class UtterancesController < ApplicationController
      before_action :authenticate_user!

      def create
        room = Room.find_by(id: params[:room_id])
        return render_error("not_found", "ルームが見つかりません", :not_found) unless room
        unless room.room_participants.exists?(user: current_user)
          return render_error("forbidden", "このルームの参加者ではありません", :forbidden)
        end

        utterance = room.utterances.new(utterance_params.merge(user: current_user))

        if utterance.save
          RoomChannel.broadcast_to(room, utterance_json(utterance))
          JudgeUtteranceJob.perform_later(utterance.id)
          render json: utterance_json(utterance), status: :created
        else
          render_error("invalid_utterance", utterance.errors.full_messages.join(", "), :unprocessable_entity)
        end
      end

      private

      def utterance_params
        params.permit(
          :transcript, :spoken_at, :duration_ms,
          :pause_before_ms, :volume_drop_ratio, :speech_rate, :realtime_score
        )
      end

      def utterance_json(utterance)
        {
          event: "utterance_created",
          utterance: {
            id: utterance.id,
            room_id: utterance.room_id,
            user_id: utterance.user_id,
            nickname: utterance.user.nickname,
            transcript: utterance.transcript,
            spoken_at: utterance.spoken_at
          }
        }
      end
    end
  end
end
