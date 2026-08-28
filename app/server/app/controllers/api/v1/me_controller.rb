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
    end
  end
end
