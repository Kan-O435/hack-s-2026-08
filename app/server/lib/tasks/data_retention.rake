namespace :data_retention do
  desc "直近9件を除き、終了から1週間以上経ったルームを関連データごと削除する(Room::RETENTION_KEEP_COUNT/RETENTION_PERIOD参照)"
  task cleanup: :environment do
    purged = Room.purge_expired!
    puts "purged #{purged} room(s)"
  end
end
