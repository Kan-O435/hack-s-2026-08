module Api
  module V1
    class UtterancesController < ApplicationController
      before_action :authenticate_user!

      def index
        room = find_room
        return unless room

        utterances = room.utterances.includes(:user).order(:spoken_at, :id)
        render json: { utterances: utterances.map { |u| utterance_list_json(u) } }
      end

      def create
        room = find_room_for_participant
        return unless room

        audio = params[:audio]
        transcript = params[:transcript]
        unless audio || transcript.present?
          return render_error("invalid_utterance", "音声またはテキストが必要です", :unprocessable_entity)
        end

        utterance = room.utterances.new(
          utterance_params.merge(user: current_user, transcript: audio ? "(文字起こし中...)" : transcript)
        )

        if utterance.save
          RoomChannel.broadcast_to(room, utterance_json(utterance))

          if audio
            TranscribeUtteranceJob.perform_later(
              utterance.id,
              Base64.strict_encode64(audio.read),
              audio.content_type
            )
          else
            # マイク非対応ブラウザの保険経路。文字起こし不要なので直接冷笑判定へ
            JudgeUtteranceJob.perform_later(utterance.id)
          end

          render json: utterance_json(utterance), status: :created
        else
          render_error("invalid_utterance", utterance.errors.full_messages.join(", "), :unprocessable_entity)
        end
      end

      private

      def find_room
        room = Room.find_by(id: params[:room_id])
        render_error("not_found", "ルームが見つかりません", :not_found) unless room
        room
      end

      def find_room_for_participant
        room = find_room
        return nil unless room
        unless room.room_participants.exists?(user: current_user)
          render_error("forbidden", "このルームの参加者ではありません", :forbidden)
          return nil
        end
        room
      end

      def utterance_list_json(utterance)
        {
          id: utterance.id,
          room_id: utterance.room_id,
          user_id: utterance.user_id,
          nickname: utterance.user.nickname,
          transcript: utterance.transcript,
          spoken_at: utterance.spoken_at,
          sneer_detected: utterance.sneer_detected,
          cringe_score: utterance.cringe_score,
          cringe_phrase: utterance.cringe_phrase,
          cringe_reason: utterance.cringe_reason
        }
      end

      def utterance_params
        params.permit(
          :spoken_at, :duration_ms,
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
