module Api
  module V1
    class MeController < ApplicationController
      before_action :authenticate_user!

      def rooms
        results = current_user.room_results.includes(:room).order(created_at: :desc)

        render json: {
          rooms: results.map do |r|
            {
              id: r.room_id,
              name: r.room.name,
              finished_at: r.room.finished_at,
              my_total_score: r.total_score,
              my_title: title_for(r.total_score)
            }
          end
        }
      end

      def sneer_cards
        page = [ params.fetch(:page, 1).to_i, 1 ].max
        per_page = params.fetch(:per_page, 20).to_i.clamp(1, 50)
        room_ids = current_user.room_participants.select(:room_id)
        scope = Utterance
          .where(room_id: room_ids, sneer_detected: true)
          .joins(:sneer_photo_attachment)
          .includes(:room, :user, sneer_photo_attachment: :blob)
          .order(snapshot_captured_at: :desc, id: :desc)

        total_count = scope.count
        cards = scope.offset((page - 1) * per_page).limit(per_page)

        render json: {
          cards: cards.map { |utterance| sneer_card_json(utterance) },
          pagination: {
            page: page,
            per_page: per_page,
            total_count: total_count,
            total_pages: (total_count.to_f / per_page).ceil
          }
        }
      end

      private

      # LLM生成の称号は導入していない(db_design.mdの初期案から実装は分岐している)。
      # スコア帯に応じた固定の称号を決定論的に付ける
      def title_for(score)
        case score
        when 300.. then "伝説の冷笑王"
        when 100...300 then "重症"
        when 30...100 then "軽症"
        else "健全"
        end
      end

      def sneer_card_json(utterance)
        {
          id: utterance.id,
          photo_url: expiring_photo_url(utterance.sneer_photo),
          snapshot_captured_at: utterance.snapshot_captured_at,
          speaker: {
            user_id: utterance.user_id,
            nickname: utterance.user.nickname
          },
          utterance: {
            transcript: utterance.transcript,
            spoken_at: utterance.spoken_at,
            cringe_score: utterance.cringe_score,
            cringe_phrase: utterance.cringe_phrase,
            cringe_reason: utterance.cringe_reason
          },
          room: {
            id: utterance.room_id,
            name: utterance.room.name
          }
        }
      end
    end
  end
end
